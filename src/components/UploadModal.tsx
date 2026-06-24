"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadFile, type UploadedFileMeta } from "@/lib/uploadClient";
import { classifyFormat, extOf } from "@/lib/cad/types";

interface FileProgress {
  file: File;
  progress: number; // 0..1
  done: boolean;
}

export function NewUploadButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-gradient-to-r from-brand-violet to-brand-fuchsia px-4 py-2 text-sm font-medium text-white shadow-lg shadow-fuchsia-500/20 transition hover:brightness-110"
      >
        + Upload model
      </button>
      {open && <UploadModal onClose={() => setOpen(false)} />}
    </>
  );
}

function UploadModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [items, setItems] = useState<FileProgress[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attachmentOnly =
    items.length > 0 && items.every((it) => classifyFormat(extOf(it.file.name)) === "attachment");

  function addFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list).map((file) => ({ file, progress: 0, done: false }));
    setItems((prev) => [...prev, ...arr]);
    if (!name && arr[0]) setName(arr[0].file.name.replace(/\.[^.]+$/, ""));
  }

  async function start() {
    if (!items.length || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const metas: UploadedFileMeta[] = [];
      for (let i = 0; i < items.length; i++) {
        const meta = await uploadFile(items[i].file, (frac) => {
          setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, progress: frac } : it)));
        });
        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, done: true, progress: 1 } : it)));
        metas.push(meta);
      }
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), files: metas }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to create project");
      const { projectId } = await res.json();
      router.push(`/projects/${projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setBusy(false);
    }
  }

  const overall = items.length ? items.reduce((a, it) => a + it.progress, 0) / items.length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="glass relative w-full max-w-lg rounded-2xl p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            <span className="gradient-text">New project</span>
          </h2>
          {!busy && (
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              ✕
            </button>
          )}
        </div>

        <label className="mb-1 block text-sm text-gray-300">Project name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          placeholder="e.g. Gearbox housing review"
          className="mb-4 w-full rounded-lg border border-edge bg-ink/70 px-3 py-2 text-sm outline-none focus:border-brand-violet"
        />

        {!busy && (
          <div
            onClick={() => inputRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
            onDragOver={(e) => e.preventDefault()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-edge bg-ink/40 p-6 text-center transition hover:border-brand-violet"
          >
            <div className="text-3xl">📦</div>
            <p className="mt-2 text-sm text-gray-300">Drop files or click to choose</p>
            <p className="mt-1 text-xs text-gray-500">STEP · IGES · STL · OBJ · glTF · PDF · native CAD (stored)</p>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </div>
        )}

        {items.length > 0 && (
          <ul className="mt-3 space-y-2">
            {items.map((it, i) => {
              const kind = classifyFormat(extOf(it.file.name));
              return (
                <li key={i} className="rounded-lg bg-ink/60 px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate">{it.file.name}</span>
                    <span className={`ml-2 shrink-0 text-xs ${it.done ? "text-brand-emerald" : "text-gray-400"}`}>
                      {it.done ? "✓ done" : busy ? `${Math.round(it.progress * 100)}%` : kind}
                    </span>
                  </div>
                  {busy && (
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-edge">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-violet to-brand-cyan transition-all"
                        style={{ width: `${it.progress * 100}%` }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {attachmentOnly && !busy && (
          <p className="mt-3 rounded-lg bg-amber-950/50 p-2 text-xs text-amber-200">
            These are native CAD files that can&apos;t render in the browser — they&apos;ll be stored for download.
            Add a STEP/PDF export for inline review.
          </p>
        )}

        {error && <p className="mt-3 rounded-lg bg-rose-950/50 p-2 text-sm text-rose-200">{error}</p>}

        {busy && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
              <span>Uploading to cloud storage…</span>
              <span>{Math.round(overall * 100)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-edge">
              <div
                className="h-full animate-gradient rounded-full bg-gradient-to-r from-brand-violet via-brand-fuchsia to-brand-cyan bg-[length:200%_auto]"
                style={{ width: `${Math.max(6, overall * 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {!busy && (
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:bg-edge">
              Cancel
            </button>
          )}
          <button
            onClick={start}
            disabled={busy || !items.length || !name.trim()}
            className="rounded-lg bg-gradient-to-r from-brand-violet to-brand-fuchsia px-5 py-2 text-sm font-medium text-white shadow-lg transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? "Working…" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}
