"use client";

import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AssemblyNode, LoadedModel } from "./types";
import { extOf } from "./types";

// One reusable parser worker per session (keeps the WASM module warm across loads).
let occtWorker: Worker | null = null;
let occtMsgId = 0;
function getOcctWorker(): Worker {
  if (!occtWorker) {
    occtWorker = new Worker(new URL("./occt.worker.ts", import.meta.url), { type: "module" });
  }
  return occtWorker;
}

// Mesh data as it arrives back from the worker (typed arrays, transferred zero-copy).
interface WorkerMesh {
  name: string;
  color: [number, number, number] | null;
  position: Float32Array;
  normal?: Float32Array;
  index?: Uint32Array;
  // per-face colours; `first`/`last` are inclusive triangle indices into the geometry
  brepFaces?: { first: number; last: number; color: [number, number, number] | null }[] | null;
}

export type ParsePhase = "init" | "parsing";

let nodeCounter = 0;
function nextId(): string {
  nodeCounter += 1;
  return `n${nodeCounter}`;
}

const defaultMaterial = () =>
  new THREE.MeshStandardMaterial({
    color: 0xb0b6c0,
    metalness: 0.25,
    roughness: 0.6,
    side: THREE.DoubleSide,
    flatShading: false,
  });

// Build a three.js Mesh from one mesh descriptor returned by the worker.
function meshFromWorker(m: WorkerMesh): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(m.position, 3));
  if (m.normal) {
    geometry.setAttribute("normal", new THREE.BufferAttribute(m.normal, 3));
  } else {
    geometry.computeVertexNormals();
  }
  if (m.index) {
    geometry.setIndex(new THREE.BufferAttribute(m.index, 1));
  }

  // Prefer per-face colours when the file provides them (STEP/IGES frequently colour individual
  // faces); fall back to the mesh colour, then the neutral default. This reproduces the source
  // model's appearance instead of flattening everything to grey.
  const faceColors = (m.brepFaces ?? []).filter((f) => f.color);
  if (faceColors.length) {
    const materials: THREE.Material[] = [];
    const colorKey = (c: [number, number, number]) => `${c[0]},${c[1]},${c[2]}`;
    const matIndexByColor = new Map<string, number>();
    const matFor = (c: [number, number, number] | null): number => {
      const key = c ? colorKey(c) : "__default";
      let idx = matIndexByColor.get(key);
      if (idx === undefined) {
        const mat = defaultMaterial();
        if (c) mat.color.setRGB(c[0], c[1], c[2]);
        else if (m.color) mat.color.setRGB(m.color[0], m.color[1], m.color[2]);
        idx = materials.push(mat) - 1;
        matIndexByColor.set(key, idx);
      }
      return idx;
    };
    // Each brep face spans an inclusive triangle range; map it to a geometry group so its
    // colour applies only to those triangles. `start`/`count` are in index units (3 per tri).
    for (const f of m.brepFaces ?? []) {
      const start = f.first * 3;
      const count = (f.last - f.first + 1) * 3;
      if (count > 0) geometry.addGroup(start, count, matFor(f.color));
    }
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.name = m.name || "part";
    return mesh;
  }

  const material = defaultMaterial();
  if (m.color) {
    material.color.setRGB(m.color[0], m.color[1], m.color[2]);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = m.name || "part";
  return mesh;
}

// Convert occt's hierarchy (result.root) into our AssemblyNode tree, attaching the
// three.js meshes by index. `meshObjects` is index-aligned with result.meshes.
function buildTree(node: any, meshObjects: THREE.Mesh[], group: THREE.Group): AssemblyNode {
  const objects: THREE.Mesh[] = [];
  if (Array.isArray(node.meshes)) {
    for (const idx of node.meshes) {
      const mesh = meshObjects[idx];
      if (mesh) {
        objects.push(mesh);
        group.add(mesh);
      }
    }
  }
  const children: AssemblyNode[] = [];
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      children.push(buildTree(child, meshObjects, group));
    }
  }
  return {
    id: nextId(),
    name: node.name && node.name.length ? node.name : "Component",
    objects,
    children,
  };
}

async function loadWithOcct(
  buffer: ArrayBuffer,
  ext: string,
  fileName: string,
  onProgress?: (phase: ParsePhase) => void
): Promise<LoadedModel> {
  const worker = getOcctWorker();
  const id = ++occtMsgId;

  const result = await new Promise<{ root: any; meshes: WorkerMesh[] }>((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
    const onMessage = (e: MessageEvent<any>) => {
      const d = e.data;
      if (!d || d.id !== id) return;
      if (d.type === "progress") {
        onProgress?.(d.phase);
      } else if (d.type === "done") {
        cleanup();
        resolve({ root: d.root, meshes: d.meshes });
      } else if (d.type === "error") {
        cleanup();
        reject(new Error(d.message));
      }
    };
    const onError = (e: ErrorEvent) => {
      cleanup();
      reject(new Error(e.message || "The model parser crashed."));
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    // Clone (don't transfer) the input buffer so the caller's copy stays usable.
    worker.postMessage({ id, ext, buffer });
  });

  const meshObjects: THREE.Mesh[] = result.meshes.map(meshFromWorker);
  const group = new THREE.Group();
  group.name = fileName;

  const rootNode = result.root ?? { name: fileName, meshes: [], children: [] };
  const tree = buildTree(rootNode, meshObjects, group);
  tree.name = tree.name === "Component" ? fileName : tree.name;

  return { root: group, tree, meshes: meshObjects };
}

// For mesh formats there is no assembly tree; wrap everything under a single root node.
function singleNodeModel(object: THREE.Object3D, fileName: string): LoadedModel {
  const group = new THREE.Group();
  group.name = fileName;
  group.add(object);
  const meshes: THREE.Mesh[] = [];
  object.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const mesh = o as THREE.Mesh;
      if (!mesh.material) mesh.material = defaultMaterial();
      meshes.push(mesh);
    }
  });
  const tree: AssemblyNode = {
    id: nextId(),
    name: fileName,
    objects: meshes,
    children: [],
  };
  return { root: group, tree, meshes };
}

// Entry point: parse an uploaded/fetched file (as ArrayBuffer) into a LoadedModel.
// `onProgress` reports which phase the (off-thread) occt parser is in, for live UI feedback.
export async function loadModel(
  buffer: ArrayBuffer,
  fileName: string,
  onProgress?: (phase: ParsePhase) => void
): Promise<LoadedModel> {
  const ext = extOf(fileName);

  if (["step", "stp", "iges", "igs", "brep"].includes(ext)) {
    return loadWithOcct(buffer, ext, fileName, onProgress);
  }

  if (ext === "stl") {
    const geometry = new STLLoader().parse(buffer);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, defaultMaterial());
    mesh.name = fileName;
    return singleNodeModel(mesh, fileName);
  }

  if (ext === "ply") {
    const geometry = new PLYLoader().parse(buffer);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, defaultMaterial());
    mesh.name = fileName;
    return singleNodeModel(mesh, fileName);
  }

  if (ext === "obj") {
    const text = new TextDecoder().decode(buffer);
    const obj = new OBJLoader().parse(text);
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = defaultMaterial();
    });
    return singleNodeModel(obj, fileName);
  }

  if (ext === "gltf" || ext === "glb") {
    const gltf = await new GLTFLoader().parseAsync(buffer, "");
    return singleNodeModel(gltf.scene, fileName);
  }

  throw new Error(`Unsupported 3D format: .${ext}`);
}

// Recursively collect every mesh under an assembly node (its own + descendants).
export function collectMeshes(node: AssemblyNode): THREE.Mesh[] {
  const out = [...node.objects];
  for (const child of node.children) out.push(...collectMeshes(child));
  return out;
}
