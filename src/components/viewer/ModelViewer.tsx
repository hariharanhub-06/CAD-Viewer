"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { loadModel, collectMeshes } from "@/lib/cad/loadModel";
import type { AssemblyNode, LoadedModel } from "@/lib/cad/types";
import { ComponentTree } from "./ComponentTree";
import { ViewerToolbar, type Tool, type DisplayMode } from "./ViewerToolbar";
import { SketchOverlay } from "./SketchOverlay";
import { captureSketch3D, buildSketchObject, type Sketch3D } from "@/lib/cad/sketch3d";

export interface ModelSource {
  buffer: ArrayBuffer;
  name: string;
}

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
}

export interface PinData {
  id: string;
  position: [number, number, number];
  label: string;
  severity?: string; // low | medium | high | critical
  resolved?: boolean;
  selected?: boolean;
}

export interface ViewerApi {
  setCamera: (state: CameraState) => void;
  getCamera: () => CameraState;
  captureThumbnail: () => string | null;
}

interface Props {
  source: ModelSource | null;
  enableAnnotation?: boolean;
  pins?: PinData[];
  // called when the user clicks the model while the Comment tool is active
  onPlacePin?: (p: {
    position: [number, number, number];
    component?: string;
    componentMeshIndex?: number;
    camera: CameraState;
  }) => void;
  onPinClick?: (id: string) => void;
  // index (in meshes[]) of the body to highlight while composing / selecting a comment
  highlightMeshIndex?: number | null;
  // 3D sketches anchored on the model (rendered persistently, rotate with the model)
  sketches?: Sketch3D[];
  // called when the user finishes a sketch and clicks Send (already captured into 3D)
  onSketchCommit?: (p: { sketch: Sketch3D; camera: CameraState }) => void;
  onReady?: (api: ViewerApi) => void;
  // severity for new markup (shown in the sketch toolbar)
  severity?: string;
  onSeverityChange?: (s: string) => void;
}

interface Measurement {
  id: number;
  a: THREE.Vector3;
  b: THREE.Vector3;
  distance: number;
  line: THREE.Line;
  label: CSS2DObject;
}

export function ModelViewer({
  source,
  enableAnnotation,
  pins,
  onPlacePin,
  onPinClick,
  highlightMeshIndex,
  sketches,
  onSketchCommit,
  onReady,
  severity,
  onSeverityChange,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const labelRendererRef = useRef<CSS2DRenderer | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);
  const modelRef = useRef<LoadedModel | null>(null);
  const measureGroupRef = useRef<THREE.Group | null>(null);
  const measurementsRef = useRef<Measurement[]>([]);
  const pendingPointRef = useRef<THREE.Vector3 | null>(null);
  const toolRef = useRef<Tool>("orbit");
  const clipPlaneRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, -1, 0), 0));
  const measureCounter = useRef(0);
  const pinsGroupRef = useRef<THREE.Group | null>(null);
  const sketchesGroupRef = useRef<THREE.Group | null>(null);
  const meshNodeMapRef = useRef<Map<string, AssemblyNode>>(new Map());
  const highlightedRef = useRef<THREE.Mesh[]>([]);
  const edgesRef = useRef<THREE.LineSegments[]>([]);
  const onPlacePinRef = useRef(onPlacePin);
  const onPinClickRef = useRef(onPinClick);
  onPlacePinRef.current = onPlacePin;
  onPinClickRef.current = onPinClick;

  const [tool, setTool] = useState<Tool>("orbit");
  const [tree, setTree] = useState<AssemblyNode | null>(null);
  const [visVersion, setVisVersion] = useState(0); // force tree re-render after visibility changes
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [measureCount, setMeasureCount] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number; node: AssemblyNode | null; hit: boolean } | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("shaded-edges");
  const [selection, setSelection] = useState<{ uuid: string; name: string } | null>(null);
  const [bounds, setBounds] = useState<{ min: number; max: number; center: number } | null>(null);
  const [section, setSection] = useState({ enabled: false, axis: "y" as "x" | "y" | "z", position: 0, flip: false });

  toolRef.current = tool;

  // ---- Scene setup (once) ----
  useEffect(() => {
    const mount = mountRef.current!;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1115);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100000);
    camera.position.set(120, 90, 160);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.localClippingEnabled = true;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.top = "0";
    labelRenderer.domElement.style.left = "0";
    labelRenderer.domElement.style.pointerEvents = "none";
    mount.appendChild(labelRenderer.domElement);
    labelRendererRef.current = labelRenderer;

    // TrackballControls gives unrestricted free rotation in every direction (no pole clamp,
    // unlike OrbitControls). SolidWorks / eDrawings-style mouse mapping:
    //   middle-button drag = rotate (free)
    //   Ctrl + middle drag  = pan
    //   wheel              = zoom in/out
    //   right-click         = context menu (handled separately)
    //   left-click          = select / measure / comment
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 3.5;
    controls.zoomSpeed = 1.3;
    controls.panSpeed = 0.8;
    controls.staticMoving = false;
    controls.dynamicDampingFactor = 0.15;
    // LEFT/RIGHT set to an inert value (no drag action) so only the middle button navigates.
    const ROTATE_MAP = { LEFT: 3, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: 3 } as any;
    const PAN_MAP = { LEFT: 3, MIDDLE: THREE.MOUSE.PAN, RIGHT: 3 } as any;
    controls.mouseButtons = ROTATE_MAP;
    controlsRef.current = controls;

    const onCtrlKey = (e: KeyboardEvent) => {
      controls.mouseButtons = e.ctrlKey ? PAN_MAP : ROTATE_MAP;
    };
    window.addEventListener("keydown", onCtrlKey);
    window.addEventListener("keyup", onCtrlKey);

    // ---- Corner axis triad (orientation indicator) ----
    const axisScene = new THREE.Scene();
    const axisCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    axisScene.add(new THREE.AxesHelper(1));
    const mkLabel = (text: string, color: string, pos: [number, number, number]) => {
      const cv = document.createElement("canvas");
      cv.width = 64;
      cv.height = 64;
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = color;
      ctx.font = "bold 46px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 32, 34);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false })
      );
      sprite.position.set(...pos);
      sprite.scale.set(0.45, 0.45, 0.45);
      return sprite;
    };
    axisScene.add(mkLabel("X", "#ff6b6b", [1.25, 0, 0]));
    axisScene.add(mkLabel("Y", "#6bff95", [0, 1.25, 0]));
    axisScene.add(mkLabel("Z", "#6ba8ff", [0, 0, 1.25]));

    // Lighting that looks reasonable without an environment map.
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const hemi = new THREE.HemisphereLight(0xffffff, 0x33384a, 0.6);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(1, 1.4, 1);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-1, 0.5, -1);
    scene.add(fill);

    const measureGroup = new THREE.Group();
    measureGroup.name = "__measures";
    scene.add(measureGroup);
    measureGroupRef.current = measureGroup;

    const pinsGroup = new THREE.Group();
    pinsGroup.name = "__pins";
    scene.add(pinsGroup);
    pinsGroupRef.current = pinsGroup;

    const sketchesGroup = new THREE.Group();
    sketchesGroup.name = "__sketches";
    scene.add(sketchesGroup);
    sketchesGroupRef.current = sketchesGroup;

    if (onReady) {
      onReady({
        getCamera: () => ({
          position: [camera.position.x, camera.position.y, camera.position.z],
          target: [controls.target.x, controls.target.y, controls.target.z],
        }),
        setCamera: (state) => {
          camera.position.set(...state.position);
          controls.target.set(...state.target);
          controls.update();
        },
        captureThumbnail: () => {
          try {
            renderer.render(scene, camera);
            const src = renderer.domElement;
            const tw = 480;
            const th = Math.max(1, Math.round((tw * src.height) / src.width));
            const off = document.createElement("canvas");
            off.width = tw;
            off.height = th;
            const ctx = off.getContext("2d");
            if (!ctx) return null;
            ctx.fillStyle = "#0b0d12";
            ctx.fillRect(0, 0, tw, th);
            ctx.drawImage(src, 0, 0, tw, th);
            return off.toDataURL("image/jpeg", 0.6);
          } catch {
            return null;
          }
        },
      });
    }

    let raf = 0;
    const TRIAD = 96;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);

      // draw the orientation triad in the bottom-right corner
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.setScissorTest(true);
      renderer.setViewport(w - TRIAD - 8, 8, TRIAD, TRIAD);
      renderer.setScissor(w - TRIAD - 8, 8, TRIAD, TRIAD);
      axisCamera.position.copy(camera.position).sub(controls.target).normalize().multiplyScalar(3);
      axisCamera.up.copy(camera.up);
      axisCamera.lookAt(0, 0, 0);
      renderer.render(axisScene, axisCamera);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      renderer.autoClear = true;

      labelRenderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
      controls.handleResize();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onCtrlKey);
      window.removeEventListener("keyup", onCtrlKey);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      mount.removeChild(labelRenderer.domElement);
    };
  }, []);

  const fitCamera = useCallback((object: THREE.Object3D) => {
    const camera = cameraRef.current!;
    const controls = controlsRef.current!;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const dist = maxDim * 2.2;
    camera.near = maxDim / 1000;
    camera.far = maxDim * 100;
    camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.9);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();

    // section slider range from bounding box on current axis
    setBounds({ min: box.min.y, max: box.max.y, center: center.y });
  }, []);

  // ---- Load model when source changes ----
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    // remove previous model
    if (modelRef.current && sceneRef.current) {
      sceneRef.current.remove(modelRef.current.root);
      modelRef.current = null;
      setTree(null);
    }
    clearMeasurements();

    loadModel(source.buffer, source.name)
      .then((model) => {
        if (cancelled) return;
        modelRef.current = model;
        sceneRef.current!.add(model.root);
        setTree(model.tree);
        // map each mesh to its owning assembly node (for right-click hide/isolate)
        const map = new Map<string, AssemblyNode>();
        const walk = (n: AssemblyNode) => {
          for (const m of n.objects) map.set(m.uuid, n);
          n.children.forEach(walk);
        };
        walk(model.tree);
        meshNodeMapRef.current = map;
        // build feature edges for each part (for shaded-with-edges / wireframe modes)
        edgesRef.current = [];
        for (const mesh of model.meshes) {
          const eg = new THREE.EdgesGeometry(mesh.geometry as THREE.BufferGeometry, 30);
          const lines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x2a2f3a }));
          lines.name = "__edges";
          mesh.add(lines);
          edgesRef.current.push(lines);
        }
        applyDisplayMode(displayMode);
        fitCamera(model.root);
        setVisVersion((v) => v + 1);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(e);
        setError(e?.message || "Failed to load model.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // ---- Pointer picking for measurement ----
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const dom = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const onClick = (ev: MouseEvent) => {
      const tool = toolRef.current;
      if (tool !== "orbit" && tool !== "measure" && tool !== "comment") return;
      if (!modelRef.current) return;
      const rect = dom.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, cameraRef.current!);
      const hits = raycaster.intersectObjects(
        modelRef.current.meshes.filter((m) => m.visible),
        false
      );

      // Plain navigation mode: left-click selects/highlights the exact body (empty = deselect).
      if (tool === "orbit") {
        if (hits.length) {
          const mesh = hits[0].object as THREE.Mesh;
          const node = meshNodeMapRef.current.get(mesh.uuid);
          setSelection({ uuid: mesh.uuid, name: node?.name ?? "part" });
        } else {
          setSelection(null);
        }
        return;
      }

      if (!hits.length) return;
      const point = hits[0].point.clone();

      if (tool === "comment") {
        const cam = cameraRef.current!;
        const ctrl = controlsRef.current!;
        const mesh = hits[0].object as THREE.Mesh;
        const node = meshNodeMapRef.current.get(mesh.uuid);
        const meshIndex = modelRef.current!.meshes.indexOf(mesh);
        onPlacePinRef.current?.({
          position: [point.x, point.y, point.z],
          component: node?.name,
          componentMeshIndex: meshIndex,
          camera: {
            position: [cam.position.x, cam.position.y, cam.position.z],
            target: [ctrl.target.x, ctrl.target.y, ctrl.target.z],
          },
        });
        return;
      }

      if (!pendingPointRef.current) {
        pendingPointRef.current = point;
        addPointMarker(point);
      } else {
        addMeasurement(pendingPointRef.current, point);
        pendingPointRef.current = null;
        clearPointMarkers();
      }
    };
    dom.addEventListener("click", onClick);
    return () => dom.removeEventListener("click", onClick);
  }, []);

  // ---- Right-click context menu (hide / isolate / show-all) ----
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const dom = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const onCtx = (ev: MouseEvent) => {
      ev.preventDefault();
      if (!modelRef.current) return;
      const rect = dom.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, cameraRef.current!);
      const hits = raycaster.intersectObjects(
        modelRef.current.meshes.filter((m) => m.visible),
        false
      );
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      if (hits.length) {
        const node = meshNodeMapRef.current.get(hits[0].object.uuid) ?? null;
        setMenu({ x, y, node, hit: true });
      } else {
        setMenu({ x, y, node: null, hit: false });
      }
    };
    dom.addEventListener("contextmenu", onCtx);
    return () => dom.removeEventListener("contextmenu", onCtx);
  }, []);

  // ---- Display mode (shaded+edges / shaded / wireframe) ----
  function applyDisplayMode(mode: DisplayMode) {
    const model = modelRef.current;
    if (!model) return;
    const showFaces = mode !== "wireframe";
    const showEdges = mode !== "shaded";
    for (const mesh of model.meshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) (m as THREE.Material).visible = showFaces;
    }
    for (const lines of edgesRef.current) {
      lines.visible = showEdges;
      // dark edges read well on shaded parts; lighter edges on the dark wireframe background
      (lines.material as THREE.LineBasicMaterial).color.setHex(mode === "wireframe" ? 0x9aa3b2 : 0x2a2f3a);
    }
  }

  useEffect(() => {
    applyDisplayMode(displayMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayMode]);

  // ---- Section / clipping ----
  useEffect(() => {
    applySection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  function applySection() {
    const model = modelRef.current;
    if (!model) return;
    const planes: THREE.Plane[] = [];
    if (section.enabled) {
      const normal = new THREE.Vector3(
        section.axis === "x" ? 1 : 0,
        section.axis === "y" ? 1 : 0,
        section.axis === "z" ? 1 : 0
      );
      if (section.flip) normal.negate();
      const plane = clipPlaneRef.current;
      plane.normal.copy(normal);
      plane.constant = section.flip ? section.position : -section.position;
      planes.push(plane);
    }
    for (const mesh of model.meshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        (mat as THREE.Material).clippingPlanes = planes;
        (mat as THREE.Material).clipShadows = true;
        (mat as THREE.Material).needsUpdate = true;
      }
    }
    // clip the feature edges too, so the section cut looks clean
    for (const lines of edgesRef.current) {
      const lm = lines.material as THREE.Material;
      lm.clippingPlanes = planes;
      lm.needsUpdate = true;
    }
  }

  // recompute slider range when axis changes
  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    const box = new THREE.Box3().setFromObject(model.root);
    const min = box.min[section.axis];
    const max = box.max[section.axis];
    setBounds({ min, max, center: (min + max) / 2 });
    setSection((s) => ({ ...s, position: (min + max) / 2 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.axis]);

  // ---- Render comment pins from props ----
  useEffect(() => {
    const group = pinsGroupRef.current;
    if (!group) return;
    while (group.children.length) group.remove(group.children[0]);
    for (const pin of pins ?? []) {
      const div = document.createElement("div");
      div.className =
        "pin-marker sev-" +
        (pin.severity || "medium") +
        (pin.resolved ? " resolved" : "") +
        (pin.selected ? " selected" : "");
      div.textContent = pin.label;
      div.style.pointerEvents = "auto";
      div.style.cursor = "pointer";
      div.onclick = (e) => {
        e.stopPropagation();
        onPinClickRef.current?.(pin.id);
      };
      const obj = new CSS2DObject(div);
      obj.position.set(...pin.position);
      group.add(obj);
    }
  }, [pins]);

  // ---- Render 3D sketches from props (anchored to the model) ----
  useEffect(() => {
    const group = sketchesGroupRef.current;
    if (!group) return;
    while (group.children.length) group.remove(group.children[0]);
    for (const sk of sketches ?? []) {
      group.add(buildSketchObject(sk));
    }
  }, [sketches]);

  // ---- Highlight the component being commented on / selected ----
  useEffect(() => {
    const setEmissive = (meshes: THREE.Mesh[], hex: number) => {
      for (const m of meshes) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          const e = (mat as THREE.MeshStandardMaterial).emissive;
          if (e) {
            e.setHex(hex);
            mat.needsUpdate = true;
          }
        }
      }
    };
    // clear previous
    setEmissive(highlightedRef.current, 0x000000);
    highlightedRef.current = [];
    const model = modelRef.current;
    if (!model) return;
    // comment highlight (blue, exact body) takes priority over plain click-selection (indigo)
    let mesh: THREE.Mesh | undefined;
    let color = 0x3a2f6b;
    if (highlightMeshIndex != null && model.meshes[highlightMeshIndex]) {
      mesh = model.meshes[highlightMeshIndex];
      color = 0x2a4d8f;
    } else if (selection) {
      mesh = model.meshes.find((m) => m.uuid === selection.uuid);
    }
    if (!mesh) return;
    setEmissive([mesh], color);
    highlightedRef.current = [mesh];
  }, [highlightMeshIndex, selection]);

  // ---- Measurement helpers ----
  function addPointMarker(p: THREE.Vector3) {
    const geom = new THREE.SphereGeometry(measurePointRadius(), 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffcc00, depthTest: false });
    const sphere = new THREE.Mesh(geom, mat);
    sphere.position.copy(p);
    sphere.name = "__pointmarker";
    sphere.renderOrder = 999;
    measureGroupRef.current!.add(sphere);
  }
  function clearPointMarkers() {
    const g = measureGroupRef.current!;
    g.children.filter((c) => c.name === "__pointmarker").forEach((c) => g.remove(c));
  }
  function measurePointRadius() {
    const model = modelRef.current;
    if (!model) return 1;
    const size = new THREE.Box3().setFromObject(model.root).getSize(new THREE.Vector3());
    return Math.max(size.x, size.y, size.z) * 0.006;
  }

  function addMeasurement(a: THREE.Vector3, b: THREE.Vector3) {
    const distance = a.distanceTo(b);
    const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
    const material = new THREE.LineBasicMaterial({ color: 0xffcc00, depthTest: false });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 998;
    measureGroupRef.current!.add(line);

    const div = document.createElement("div");
    div.className = "measure-label";
    div.textContent = formatDistance(distance);
    const label = new CSS2DObject(div);
    label.position.copy(a.clone().add(b).multiplyScalar(0.5));
    measureGroupRef.current!.add(label);

    measureCounter.current += 1;
    measurementsRef.current.push({ id: measureCounter.current, a, b, distance, line, label });
    setMeasureCount(measurementsRef.current.length);
  }

  function clearMeasurements() {
    const g = measureGroupRef.current;
    if (!g) return;
    for (const m of measurementsRef.current) {
      g.remove(m.line);
      g.remove(m.label);
    }
    measurementsRef.current = [];
    pendingPointRef.current = null;
    clearPointMarkers();
    setMeasureCount(0);
  }

  // ---- Tree visibility ops ----
  const setNodeVisibility = useCallback((node: AssemblyNode, visible: boolean) => {
    for (const mesh of collectMeshes(node)) mesh.visible = visible;
    setVisVersion((v) => v + 1);
  }, []);

  const isolateNode = useCallback((node: AssemblyNode) => {
    const model = modelRef.current;
    if (!model) return;
    for (const mesh of model.meshes) mesh.visible = false;
    for (const mesh of collectMeshes(node)) mesh.visible = true;
    setVisVersion((v) => v + 1);
  }, []);

  const showAll = useCallback(() => {
    const model = modelRef.current;
    if (!model) return;
    for (const mesh of model.meshes) mesh.visible = true;
    setVisVersion((v) => v + 1);
  }, []);

  const resetView = useCallback(() => {
    if (modelRef.current) fitCamera(modelRef.current.root);
  }, [fitCamera]);

  return (
    <div className="flex h-full w-full">
      {/* Left: component tree */}
      <div className="w-64 shrink-0 overflow-y-auto border-r border-edge bg-panel">
        <div className="flex items-center justify-between px-3 py-2 text-xs uppercase tracking-wide text-gray-400">
          <span>Components</span>
          <button onClick={showAll} className="rounded px-1 text-gray-300 hover:bg-edge" title="Show all">
            show all
          </button>
        </div>
        {tree ? (
          <ComponentTree
            node={tree}
            depth={0}
            version={visVersion}
            onToggle={setNodeVisibility}
            onIsolate={isolateNode}
          />
        ) : (
          <div className="px-3 py-2 text-xs text-gray-500">No model loaded.</div>
        )}
      </div>

      {/* Center: canvas + toolbar */}
      <div className="relative flex-1">
        <ViewerToolbar
          tool={tool}
          onToolChange={setTool}
          onResetView={resetView}
          onClearMeasurements={clearMeasurements}
          measureCount={measureCount}
          section={section}
          onSectionChange={setSection}
          bounds={bounds}
          enableAnnotation={enableAnnotation}
          displayMode={displayMode}
          onDisplayModeChange={setDisplayMode}
        />
        <div ref={mountRef} className="absolute inset-0" />

        <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded bg-black/55 px-2 py-1 text-[11px] leading-relaxed text-gray-300">
          <div>🖱 Middle-drag: rotate · Ctrl+Middle: pan · Wheel: zoom</div>
          <div>Click a part to select · Right-click: hide / isolate · empty: show all</div>
        </div>

        {selection && (
          <div className="pointer-events-none absolute left-3 top-3 z-10 rounded bg-accent/90 px-3 py-1 text-xs font-medium text-white shadow">
            Selected: {selection.name}
          </div>
        )}

        {enableAnnotation && tool === "sketch" && (
          <SketchOverlay
            severity={severity}
            onSeverityChange={onSeverityChange}
            onCancel={() => setTool("orbit")}
            onSave={(shapes, view) => {
              const cam = cameraRef.current!;
              const ctrl = controlsRef.current!;
              if (modelRef.current && onSketchCommit) {
                const sketch = captureSketch3D(shapes, view, cam, modelRef.current.meshes, ctrl.target);
                onSketchCommit({
                  sketch,
                  camera: {
                    position: [cam.position.x, cam.position.y, cam.position.z],
                    target: [ctrl.target.x, ctrl.target.y, ctrl.target.z],
                  },
                });
              }
              setTool("orbit");
            }}
          />
        )}
        {loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-300">
            Parsing model…
          </div>
        )}
        {error && (
          <div className="absolute left-1/2 top-1/2 max-w-md -translate-x-1/2 -translate-y-1/2 rounded border border-red-700 bg-red-950/80 p-4 text-sm text-red-200">
            {error}
          </div>
        )}
        {tool === "measure" && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-black/60 px-3 py-1 text-xs text-gray-200">
            Click two points on the model to measure distance
          </div>
        )}
        {tool === "comment" && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-black/60 px-3 py-1 text-xs text-gray-200">
            Click a point on the model to attach a comment
          </div>
        )}

        {/* Right-click context menu */}
        {menu && (
          <>
            <div
              className="absolute inset-0 z-40"
              onClick={() => setMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu(null);
              }}
            />
            <div
              className="absolute z-50 min-w-[160px] overflow-hidden rounded-md border border-edge bg-panel py-1 text-sm shadow-xl"
              style={{ left: menu.x, top: menu.y }}
            >
              {menu.hit && menu.node ? (
                <>
                  <div className="truncate px-3 py-1 text-xs text-gray-500">{menu.node.name}</div>
                  <button
                    className="block w-full px-3 py-1.5 text-left hover:bg-edge"
                    onClick={() => {
                      setNodeVisibility(menu.node!, false);
                      setMenu(null);
                    }}
                  >
                    🚫 Hide
                  </button>
                  <button
                    className="block w-full px-3 py-1.5 text-left hover:bg-edge"
                    onClick={() => {
                      isolateNode(menu.node!);
                      setMenu(null);
                    }}
                  >
                    🎯 Isolate
                  </button>
                </>
              ) : (
                <button
                  className="block w-full px-3 py-1.5 text-left hover:bg-edge"
                  onClick={() => {
                    showAll();
                    setMenu(null);
                  }}
                >
                  👁 Show all hidden
                </button>
              )}
              <div className="my-1 h-px bg-edge" />
              <button
                className="block w-full px-3 py-1.5 text-left hover:bg-edge"
                onClick={() => {
                  resetView();
                  setMenu(null);
                }}
              >
                ⤢ Fit to view
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatDistance(d: number): string {
  if (d < 1) return `${(d).toFixed(3)} mm`;
  if (d < 1000) return `${d.toFixed(2)} mm`;
  return `${(d / 1000).toFixed(3)} m`;
}
