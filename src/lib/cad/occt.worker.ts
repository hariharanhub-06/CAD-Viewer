/// <reference lib="webworker" />
// Parses STEP / IGES / BREP files with the occt (OpenCascade) WASM module OFF the main thread.
// occt's ReadStepFile/etc. are synchronous and CPU-heavy; running them here keeps the UI
// responsive (spinner animates, controls stay live) instead of freezing the tab for minutes.

import occtimportjs from "occt-import-js";

interface OcctModule {
  ReadStepFile: (data: Uint8Array, params: unknown) => any;
  ReadIgesFile: (data: Uint8Array, params: unknown) => any;
  ReadBrepFile: (data: Uint8Array, params: unknown) => any;
}

let occtPromise: Promise<OcctModule> | null = null;
function getOcct(): Promise<OcctModule> {
  if (!occtPromise) {
    occtPromise = occtimportjs({
      locateFile: (file: string) => `/wasm/${file}`,
    }) as Promise<OcctModule>;
  }
  return occtPromise;
}

interface ParseRequest {
  id: number;
  ext: string;
  buffer: ArrayBuffer;
}

const ctx = self as unknown as Worker;

ctx.onmessage = async (e: MessageEvent<ParseRequest>) => {
  const { id, ext, buffer } = e.data;
  try {
    ctx.postMessage({ id, type: "progress", phase: "init" });
    const occt = await getOcct();
    ctx.postMessage({ id, type: "progress", phase: "parsing" });

    const data = new Uint8Array(buffer);
    let result: any;
    if (ext === "step" || ext === "stp") result = occt.ReadStepFile(data, null);
    else if (ext === "iges" || ext === "igs") result = occt.ReadIgesFile(data, null);
    else if (ext === "brep") result = occt.ReadBrepFile(data, null);
    else throw new Error(`Unsupported occt format: ${ext}`);

    if (!result || !result.success) {
      throw new Error(`Failed to parse ${ext.toUpperCase()} file.`);
    }

    // Repackage meshes into typed arrays and transfer their buffers back (zero-copy), so the
    // main thread never has to clone a potentially huge plain-number array.
    const transfer: ArrayBuffer[] = [];
    const meshes = result.meshes.map((m: any) => {
      const position = Float32Array.from(m.attributes.position.array);
      transfer.push(position.buffer as ArrayBuffer);
      let normal: Float32Array | undefined;
      if (m.attributes.normal) {
        normal = Float32Array.from(m.attributes.normal.array);
        transfer.push(normal.buffer as ArrayBuffer);
      }
      let index: Uint32Array | undefined;
      if (m.index) {
        index = Uint32Array.from(m.index.array);
        transfer.push(index.buffer as ArrayBuffer);
      }
      // Per-face colours (STEP/IGES often colour individual faces rather than whole solids).
      const brepFaces = Array.isArray(m.brep_faces)
        ? m.brep_faces.map((f: any) => ({ first: f.first, last: f.last, color: f.color ?? null }))
        : null;
      return { name: m.name ?? "", color: m.color ?? null, position, normal, index, brepFaces };
    });

    ctx.postMessage({ id, type: "done", root: result.root ?? null, meshes }, transfer);
  } catch (err: any) {
    ctx.postMessage({ id, type: "error", message: err?.message || String(err) });
  }
};
