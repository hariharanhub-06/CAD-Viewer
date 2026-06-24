"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ModelViewer, type ModelSource } from "./ModelViewer";
import { extOf, classifyFormat } from "@/lib/cad/types";

export function LocalViewer() {
  const [source, setSource] = useState<ModelSource | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openFile = useCallback(async (file: File) => {
    const ext = extOf(file.name);
    const kind = classifyFormat(ext);
    if (kind === "attachment") {
      setWarning(
        `.${ext} is a native CAD format that cannot be rendered in the browser. ` +
          `Please export it to STEP (.step) for 3D, or PDF for drawings, then open that file.`
      );
      return;
    }
    if (kind === "pdf") {
      setWarning("PDF viewing is available on uploaded projects. Use a 3D format here (STEP, STL, OBJ, glTF…).");
      return;
    }
    setWarning(null);
    const buffer = await file.arrayBuffer();
    setSource({ buffer, name: file.name });
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) openFile(file);
    },
    [openFile]
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-edge bg-panel px-4 py-2">
        <div className="flex items-center gap-3">
          <Link href="/" className="gradient-text font-semibold">
            CAD Review
          </Link>
          <span className="text-xs text-gray-500">local viewer</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="rounded border border-edge px-3 py-1.5 text-sm text-gray-200 hover:bg-panel"
          >
            My projects →
          </Link>
          <button
            onClick={() => inputRef.current?.click()}
            className="rounded bg-accent px-3 py-1.5 text-sm text-white hover:bg-blue-500"
          >
            Open model…
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".step,.stp,.iges,.igs,.brep,.stl,.obj,.ply,.gltf,.glb"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) openFile(f);
            }}
          />
        </div>
      </header>

      {warning && (
        <div className="border-b border-yellow-800 bg-yellow-950/60 px-4 py-2 text-sm text-yellow-200">
          {warning}
        </div>
      )}

      <div className="relative flex-1" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
        {source ? (
          <ModelViewer source={source} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-gray-400">
            <div className="text-5xl">📦</div>
            <p className="text-lg text-gray-200">Drop a 3D model here</p>
            <p className="max-w-md text-sm">
              Supports STEP, IGES, BREP, STL, OBJ, PLY, glTF/GLB. STEP assemblies keep their
              component tree so you can hide/isolate sub-assemblies, section, and measure.
            </p>
            <button
              onClick={() => inputRef.current?.click()}
              className="mt-2 rounded border border-edge px-4 py-2 text-sm text-gray-200 hover:bg-panel"
            >
              or choose a file
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
