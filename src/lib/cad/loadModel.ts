"use client";

import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AssemblyNode, LoadedModel } from "./types";
import { extOf } from "./types";

let occtPromise: Promise<any> | null = null;

// Lazily initialise the OpenCascade WASM module once per session.
async function getOcct(): Promise<any> {
  if (!occtPromise) {
    occtPromise = (async () => {
      const occtimportjs = (await import("occt-import-js")).default;
      return await occtimportjs({
        locateFile: (file: string) => `/wasm/${file}`,
      });
    })();
  }
  return occtPromise;
}

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

// Build a three.js Mesh from one occt mesh descriptor.
function meshFromOcct(m: any): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(m.attributes.position.array, 3)
  );
  if (m.attributes.normal) {
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(m.attributes.normal.array, 3)
    );
  } else {
    geometry.computeVertexNormals();
  }
  if (m.index) {
    geometry.setIndex(m.index.array);
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
  data: Uint8Array,
  ext: string,
  fileName: string
): Promise<LoadedModel> {
  const occt = await getOcct();
  let result: any;
  if (ext === "step" || ext === "stp") {
    result = occt.ReadStepFile(data, null);
  } else if (ext === "iges" || ext === "igs") {
    result = occt.ReadIgesFile(data, null);
  } else if (ext === "brep") {
    result = occt.ReadBrepFile(data, null);
  } else {
    throw new Error(`Unsupported occt format: ${ext}`);
  }
  if (!result || !result.success) {
    throw new Error(`Failed to parse ${ext.toUpperCase()} file.`);
  }

  const meshObjects: THREE.Mesh[] = result.meshes.map((m: any) => meshFromOcct(m));
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
export async function loadModel(buffer: ArrayBuffer, fileName: string): Promise<LoadedModel> {
  const ext = extOf(fileName);
  const data = new Uint8Array(buffer);

  if (["step", "stp", "iges", "igs", "brep"].includes(ext)) {
    return loadWithOcct(data, ext, fileName);
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
