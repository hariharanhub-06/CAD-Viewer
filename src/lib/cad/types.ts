import type * as THREE from "three";

// A node in the assembly hierarchy. For STEP/IGES this mirrors the
// PRODUCT_DEFINITION / NEXT_ASSEMBLY_USAGE_OCCURRENCE tree that occt-import-js
// returns as `result.root`. For mesh formats (STL/OBJ/...) there is a single root.
export interface AssemblyNode {
  id: string;
  name: string;
  // three.js meshes that belong directly to this node
  objects: THREE.Mesh[];
  children: AssemblyNode[];
}

export interface LoadedModel {
  // group containing every mesh in the model
  root: THREE.Group;
  // assembly hierarchy used to drive the component tree + hide/isolate
  tree: AssemblyNode;
  // flat list of every mesh (for measurement raycasting / global ops)
  meshes: THREE.Mesh[];
}

export const VIEWABLE_3D_EXTS = ["step", "stp", "iges", "igs", "brep", "stl", "obj", "ply", "gltf", "glb"];
export const PDF_EXTS = ["pdf"];
// Native CAD formats we accept for storage/sharing but cannot render inline.
export const ATTACHMENT_EXTS = ["easm", "eprt", "edrw", "sldprt", "sldasm", "slddrw", "dwg", "dxf", "x_t", "x_b", "sat", "jt", "catpart", "catproduct", "prt", "asm"];

export function classifyFormat(ext: string): "viewable3d" | "pdf" | "attachment" {
  const e = ext.toLowerCase();
  if (PDF_EXTS.includes(e)) return "pdf";
  if (VIEWABLE_3D_EXTS.includes(e)) return "viewable3d";
  return "attachment";
}

export function extOf(filename: string): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9_]+)$/);
  return m ? m[1] : "";
}
