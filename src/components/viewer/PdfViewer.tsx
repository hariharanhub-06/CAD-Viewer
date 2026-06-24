"use client";

import { useEffect, useRef, useState } from "react";

// Renders a PDF (drawings/docs) page-by-page to canvases via pdf.js.
export function PdfViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1.2);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load PDF (${res.status})`);
        const data = await res.arrayBuffer();
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        setPageCount(doc.numPages);

        const container = containerRef.current!;
        container.innerHTML = "";
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          if (cancelled) return;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "mx-auto mb-4 shadow-lg";
          const ctx = canvas.getContext("2d")!;
          container.appendChild(canvas);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to render PDF");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, scale]);

  return (
    <div className="relative h-full">
      <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-edge bg-panel/90 p-1 text-sm shadow-lg">
        <button onClick={() => setScale((s) => Math.max(0.5, s - 0.2))} className="rounded px-2 py-1 hover:bg-edge">
          −
        </button>
        <span className="text-xs text-gray-400">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => Math.min(3, s + 0.2))} className="rounded px-2 py-1 hover:bg-edge">
          +
        </button>
        {pageCount > 0 && <span className="ml-1 text-xs text-gray-500">{pageCount} pages</span>}
      </div>
      {error && <div className="p-4 text-sm text-red-300">{error}</div>}
      <div ref={containerRef} className="h-full overflow-y-auto bg-ink p-6 pt-16" />
    </div>
  );
}
