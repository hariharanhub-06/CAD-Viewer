import * as THREE from "three";
import type { SketchShape } from "@/components/viewer/SketchOverlay";

// A sketch captured into 3D. Each stroke point is projected onto the model surface where it
// was drawn (so marks conform to the geometry and stay put as you orbit). Points drawn off
// the model fall back to a stable plane through the drawing's anchor. Coordinates are WORLD.
type V3 = [number, number, number];

export type Sketch3DShape =
  | { kind: "path"; pts: V3[]; color: string }
  | { kind: "rect"; pts: V3[]; color: string }
  | { kind: "arrow"; a: V3; b: V3; color: string }
  | { kind: "text"; at: V3; text: string; color: string; size: number };

export interface Sketch3D {
  shapes: Sketch3DShape[];
  // in-plane basis (camera right/up at capture) so text rotates with the model
  right?: V3;
  up?: V3;
}

function allPoints(shapes: SketchShape[]): [number, number][] {
  const pts: [number, number][] = [];
  for (const s of shapes) {
    if (s.kind === "path") pts.push(...s.points);
    else if (s.kind === "rect" || s.kind === "ellipse") pts.push([s.x, s.y], [s.x + s.w, s.y + s.h]);
    else if (s.kind === "arrow") pts.push([s.x1, s.y1], [s.x2, s.y2]);
    else if (s.kind === "text") pts.push([s.x, s.y]);
  }
  return pts;
}

export function captureSketch3D(
  shapes: SketchShape[],
  view: { w: number; h: number },
  camera: THREE.PerspectiveCamera,
  meshes: THREE.Mesh[],
  target: THREE.Vector3
): Sketch3D {
  const visible = meshes.filter((m) => m.visible);
  const raycaster = new THREE.Raycaster();
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);

  // Anchor + fallback plane (used for points that miss the model).
  const pts = allPoints(shapes);
  const cx = pts.reduce((a, p) => a + p[0], 0) / (pts.length || 1);
  const cy = pts.reduce((a, p) => a + p[1], 0) / (pts.length || 1);
  const ndc = (px: number, py: number) => new THREE.Vector2((px / view.w) * 2 - 1, -((py / view.h) * 2 - 1));
  raycaster.setFromCamera(ndc(cx, cy), camera);
  const anchorHit = raycaster.intersectObjects(visible, false);
  const anchor = anchorHit.length
    ? anchorHit[0].point.clone()
    : raycaster.ray.at(camera.position.distanceTo(target), new THREE.Vector3());
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const wpp = (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.distanceTo(anchor)) / view.h;

  // Project a 2D screen point to a 3D world point: onto the surface if it hits, else the plane.
  const project = (px: number, py: number): V3 => {
    raycaster.setFromCamera(ndc(px, py), camera);
    const hit = raycaster.intersectObjects(visible, false);
    let p: THREE.Vector3;
    if (hit.length) {
      p = hit[0].point.clone();
      // lift slightly toward the camera so the mark sits on top of the face (no z-fighting)
      const lift = camera.position.distanceTo(p) * 0.003;
      p.addScaledVector(camDir, -lift);
    } else {
      p = anchor.clone().addScaledVector(right, (px - cx) * wpp).addScaledVector(up, -(py - cy) * wpp);
    }
    return [p.x, p.y, p.z];
  };

  const out: Sketch3DShape[] = shapes.map((s) => {
    switch (s.kind) {
      case "path":
        return { kind: "path", color: s.color, pts: s.points.map(([x, y]) => project(x, y)) };
      case "rect":
        return {
          kind: "rect",
          color: s.color,
          pts: [
            project(s.x, s.y),
            project(s.x + s.w, s.y),
            project(s.x + s.w, s.y + s.h),
            project(s.x, s.y + s.h),
            project(s.x, s.y),
          ],
        };
      case "ellipse": {
        const ecx = s.x + s.w / 2;
        const ecy = s.y + s.h / 2;
        const rx = s.w / 2;
        const ry = s.h / 2;
        const N = 48;
        const ept: V3[] = [];
        for (let i = 0; i <= N; i++) {
          const ang = (i / N) * Math.PI * 2;
          ept.push(project(ecx + Math.cos(ang) * rx, ecy + Math.sin(ang) * ry));
        }
        return { kind: "path", color: s.color, pts: ept };
      }
      case "arrow":
        return { kind: "arrow", color: s.color, a: project(s.x1, s.y1), b: project(s.x2, s.y2) };
      case "text":
        return { kind: "text", color: s.color, at: project(s.x, s.y), text: s.text, size: s.size * wpp };
    }
  });

  return { shapes: out, right: [right.x, right.y, right.z], up: [up.x, up.y, up.z] };
}

// Text that lies in the sketch plane (rotates with the model). Oriented by the capture basis.
function textPlane(
  text: string,
  color: string,
  worldHeight: number,
  at: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3
): THREE.Mesh {
  const pad = 8;
  const fontPx = 64;
  const lineH = fontPx * 1.25;
  const lines = text.split("\n");
  const cv = document.createElement("canvas");
  const m = cv.getContext("2d")!;
  m.font = `bold ${fontPx}px sans-serif`;
  cv.width = Math.max(2, ...lines.map((l) => m.measureText(l).width)) + pad * 2;
  cv.height = lines.length * lineH + pad * 2;
  const c2 = cv.getContext("2d")!;
  c2.font = `bold ${fontPx}px sans-serif`;
  c2.fillStyle = color;
  c2.textBaseline = "middle";
  lines.forEach((ln, i) => c2.fillText(ln, pad, pad + lineH * (i + 0.5)));

  // worldHeight is one line's height; scale the plane by the number of lines
  const totalH = worldHeight * lines.length;
  const aspect = cv.width / cv.height;
  const geo = new THREE.PlaneGeometry(totalH * aspect, totalH);
  const mat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(cv),
    transparent: true,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  const r = right.clone().normalize();
  const u = up.clone().normalize();
  const n = new THREE.Vector3().crossVectors(r, u).normalize();
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, n));
  // anchor the left edge near the click point
  mesh.position.copy(at).addScaledVector(r, (totalH * aspect) / 2);
  mesh.renderOrder = 998;
  return mesh;
}

function textSprite(text: string, color: string, worldHeight: number): THREE.Sprite {
  const pad = 8;
  const fontPx = 64;
  const cv = document.createElement("canvas");
  const m = cv.getContext("2d")!;
  m.font = `bold ${fontPx}px sans-serif`;
  cv.width = m.measureText(text).width + pad * 2;
  cv.height = fontPx + pad * 2;
  const c2 = cv.getContext("2d")!;
  c2.font = `bold ${fontPx}px sans-serif`;
  c2.fillStyle = color;
  c2.textBaseline = "middle";
  c2.fillText(text, pad, cv.height / 2);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true })
  );
  sprite.scale.set(worldHeight * (cv.width / cv.height), worldHeight, 1);
  sprite.renderOrder = 998;
  return sprite;
}

function lineFrom(points: THREE.Vector3[], color: string): THREE.Line {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: new THREE.Color(color), depthTest: false })
  );
  line.renderOrder = 997;
  return line;
}

export function buildSketchObject(data: Sketch3D): THREE.Group {
  const group = new THREE.Group();
  group.name = "__sketch";
  // Tolerate old/partial sketch records: skip any shape missing its expected fields.
  for (const s of data?.shapes ?? []) {
    if (s.kind === "path" || s.kind === "rect") {
      if (!Array.isArray(s.pts)) continue;
      group.add(lineFrom(s.pts.map((p) => new THREE.Vector3(...p)), s.color));
    } else if (s.kind === "arrow") {
      if (!s.a || !s.b) continue;
      const a = new THREE.Vector3(...s.a);
      const b = new THREE.Vector3(...s.b);
      group.add(lineFrom([a, b], s.color));
      // arrowhead at b
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length() || 1;
      dir.normalize();
      const perp = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 0, 1));
      if (perp.lengthSq() < 1e-6) perp.crossVectors(dir, new THREE.Vector3(0, 1, 0));
      perp.normalize();
      const hl = len * 0.18;
      const tip = b.clone();
      const back = b.clone().addScaledVector(dir, -hl);
      group.add(lineFrom([tip, back.clone().addScaledVector(perp, hl * 0.6)], s.color));
      group.add(lineFrom([tip, back.clone().addScaledVector(perp, -hl * 0.6)], s.color));
    } else if (s.kind === "text") {
      if (!s.at) continue;
      const at = new THREE.Vector3(...s.at);
      if (data.right && data.up) {
        // in-plane text → rotates with the model
        group.add(textPlane(s.text, s.color, s.size, at, new THREE.Vector3(...data.right), new THREE.Vector3(...data.up)));
      } else {
        // old data without a basis → fall back to a camera-facing label
        const sprite = textSprite(s.text, s.color, s.size);
        sprite.position.copy(at);
        group.add(sprite);
      }
    }
  }
  return group;
}
