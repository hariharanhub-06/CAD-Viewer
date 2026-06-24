"use client";

import { useEffect, useRef, useState } from "react";

export type SketchShape =
  | { kind: "path"; points: [number, number][]; color: string; width: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; color: string; width: number }
  | { kind: "ellipse"; x: number; y: number; w: number; h: number; color: string; width: number }
  | { kind: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { kind: "text"; x: number; y: number; text: string; color: string; size: number };

type SketchTool = "select" | "pencil" | "rect" | "ellipse" | "arrow" | "text";

const COLORS = ["#ffcc00", "#ff5577", "#33cc77", "#3b82f6", "#ffffff"];

// ---- Static renderer (used to show saved sketches) ----
export function SketchView({
  shapes,
  view,
  width,
  height,
}: {
  shapes: SketchShape[];
  view: { w: number; h: number };
  width: number;
  height: number;
}) {
  const sx = width / view.w;
  const sy = height / view.h;
  return (
    <svg width={width} height={height} className="pointer-events-none absolute inset-0">
      <defs>
        <marker id="sk-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
          <path d="M0,0 L0,6 L9,3 z" fill="context-stroke" />
        </marker>
      </defs>
      {shapes.map((s, i) => renderShape(s, i, sx, sy))}
    </svg>
  );
}

function renderShape(s: SketchShape, i: number, sx: number, sy: number) {
  switch (s.kind) {
    case "path":
      return (
        <polyline
          key={i}
          points={s.points.map(([x, y]) => `${x * sx},${y * sy}`).join(" ")}
          fill="none"
          stroke={s.color}
          strokeWidth={s.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case "rect":
      return (
        <rect key={i} x={s.x * sx} y={s.y * sy} width={s.w * sx} height={s.h * sy} fill="none" stroke={s.color} strokeWidth={s.width} />
      );
    case "ellipse":
      return (
        <ellipse
          key={i}
          cx={(s.x + s.w / 2) * sx}
          cy={(s.y + s.h / 2) * sy}
          rx={Math.abs(s.w / 2) * sx}
          ry={Math.abs(s.h / 2) * sy}
          fill="none"
          stroke={s.color}
          strokeWidth={s.width}
        />
      );
    case "arrow":
      return (
        <line key={i} x1={s.x1 * sx} y1={s.y1 * sy} x2={s.x2 * sx} y2={s.y2 * sy} stroke={s.color} strokeWidth={s.width} markerEnd="url(#sk-arrow)" />
      );
    case "text":
      return (
        <text key={i} x={s.x * sx} y={s.y * sy} fill={s.color} fontSize={s.size} fontWeight={600}>
          {s.text}
        </text>
      );
  }
}

// ---- Geometry helpers for selection / move ----
function bbox(s: SketchShape): { x: number; y: number; w: number; h: number } {
  switch (s.kind) {
    case "path": {
      const xs = s.points.map((p) => p[0]);
      const ys = s.points.map((p) => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case "rect":
    case "ellipse":
      return { x: s.x, y: s.y, w: s.w, h: s.h };
    case "arrow":
      return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
    case "text":
      return { x: s.x, y: s.y - s.size, w: Math.max(20, s.text.length * s.size * 0.6), h: s.size + 4 };
  }
}

function hit(s: SketchShape, x: number, y: number): boolean {
  const b = bbox(s);
  const tol = 8;
  return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol;
}

function scalePt(px: number, py: number, pivot: [number, number], sx: number, sy: number): [number, number] {
  return [pivot[0] + (px - pivot[0]) * sx, pivot[1] + (py - pivot[1]) * sy];
}

function scaleShape(s: SketchShape, pivot: [number, number], sx: number, sy: number): SketchShape {
  switch (s.kind) {
    case "path":
      return { ...s, points: s.points.map(([x, y]) => scalePt(x, y, pivot, sx, sy)) };
    case "rect":
    case "ellipse": {
      const [ax, ay] = scalePt(s.x, s.y, pivot, sx, sy);
      const [bx, by] = scalePt(s.x + s.w, s.y + s.h, pivot, sx, sy);
      return { ...s, x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
    }
    case "arrow": {
      const [a1, a2] = scalePt(s.x1, s.y1, pivot, sx, sy);
      const [b1, b2] = scalePt(s.x2, s.y2, pivot, sx, sy);
      return { ...s, x1: a1, y1: a2, x2: b1, y2: b2 };
    }
    case "text": {
      const [ax, ay] = scalePt(s.x, s.y, pivot, sx, sy);
      return { ...s, x: ax, y: ay, size: Math.max(6, s.size * Math.abs(sy)) };
    }
  }
}

function translate(s: SketchShape, dx: number, dy: number): SketchShape {
  switch (s.kind) {
    case "path":
      return { ...s, points: s.points.map(([x, y]) => [x + dx, y + dy]) };
    case "rect":
    case "ellipse":
      return { ...s, x: s.x + dx, y: s.y + dy };
    case "arrow":
      return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
    case "text":
      return { ...s, x: s.x + dx, y: s.y + dy };
  }
}

// ---- Interactive drawing overlay ----
const SEVERITIES: { value: string; label: string; cls: string }[] = [
  { value: "low", label: "Low", cls: "bg-slate-600 text-white" },
  { value: "medium", label: "Med", cls: "bg-blue-600 text-white" },
  { value: "high", label: "High", cls: "bg-amber-500 text-black" },
  { value: "critical", label: "Crit", cls: "bg-red-600 text-white" },
];

export function SketchOverlay({
  onSave,
  onCancel,
  severity = "medium",
  onSeverityChange,
}: {
  onSave: (shapes: SketchShape[], view: { w: number; h: number }) => void;
  onCancel: () => void;
  severity?: string;
  onSeverityChange?: (s: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<SketchTool>("pencil");
  const [shape, setShape] = useState<"rect" | "ellipse">("rect");
  const [shapeMenu, setShapeMenu] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [shapes, setShapes] = useState<SketchShape[]>([]);
  const [draft, setDraft] = useState<SketchShape | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [textEntry, setTextEntry] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const drawing = useRef(false);
  const drag = useRef<{ last: [number, number] } | null>(null);
  const resize = useRef<{ pivot: [number, number]; startCorner: [number, number]; orig: SketchShape } | null>(null);

  function pos(e: { clientX: number; clientY: number }): [number, number] {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  // delete selected with Delete/Backspace
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selected !== null) {
        setShapes((prev) => prev.filter((_, i) => i !== selected));
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function onDown(e: React.PointerEvent) {
    const [x, y] = pos(e);
    if (tool === "select") {
      // if a shape is selected, check its resize handles first
      if (selected !== null && shapes[selected]) {
        const b = bbox(shapes[selected]);
        const corners: { pt: [number, number]; pivot: [number, number] }[] = [
          { pt: [b.x - 6, b.y - 6], pivot: [b.x + b.w + 6, b.y + b.h + 6] },
          { pt: [b.x + b.w + 6, b.y - 6], pivot: [b.x - 6, b.y + b.h + 6] },
          { pt: [b.x + b.w + 6, b.y + b.h + 6], pivot: [b.x - 6, b.y - 6] },
          { pt: [b.x - 6, b.y + b.h + 6], pivot: [b.x + b.w + 6, b.y - 6] },
        ];
        for (const c of corners) {
          if (Math.hypot(x - c.pt[0], y - c.pt[1]) < 12) {
            resize.current = { pivot: c.pivot, startCorner: c.pt, orig: shapes[selected] };
            return;
          }
        }
      }
      // otherwise select / move the topmost shape under the cursor
      let idx: number | null = null;
      for (let i = shapes.length - 1; i >= 0; i--) {
        if (hit(shapes[i], x, y)) {
          idx = i;
          break;
        }
      }
      setSelected(idx);
      if (idx !== null) drag.current = { last: [x, y] };
      return;
    }
    if (tool === "text") return;
    drawing.current = true;
    if (tool === "pencil") setDraft({ kind: "path", points: [[x, y]], color, width: 2.5 });
    else if (tool === "rect") setDraft({ kind: "rect", x, y, w: 0, h: 0, color, width: 2.5 });
    else if (tool === "ellipse") setDraft({ kind: "ellipse", x, y, w: 0, h: 0, color, width: 2.5 });
    else if (tool === "arrow") setDraft({ kind: "arrow", x1: x, y1: y, x2: x, y2: y, color, width: 2.5 });
  }

  function onMove(e: React.PointerEvent) {
    const [x, y] = pos(e);
    if (tool === "select" && resize.current && selected !== null) {
      const { pivot, startCorner, orig } = resize.current;
      const sx = Math.max(0.05, (x - pivot[0]) / ((startCorner[0] - pivot[0]) || 1));
      const sy = Math.max(0.05, (y - pivot[1]) / ((startCorner[1] - pivot[1]) || 1));
      setShapes((prev) => prev.map((s, i) => (i === selected ? scaleShape(orig, pivot, sx, sy) : s)));
      return;
    }
    if (tool === "select" && drag.current && selected !== null) {
      const [lx, ly] = drag.current.last;
      const dx = x - lx, dy = y - ly;
      drag.current.last = [x, y];
      setShapes((prev) => prev.map((s, i) => (i === selected ? translate(s, dx, dy) : s)));
      return;
    }
    if (!drawing.current || !draft) return;
    if (draft.kind === "path") setDraft({ ...draft, points: [...draft.points, [x, y]] });
    else if (draft.kind === "rect" || draft.kind === "ellipse") setDraft({ ...draft, w: x - draft.x, h: y - draft.y });
    else if (draft.kind === "arrow") setDraft({ ...draft, x2: x, y2: y });
  }

  function onUp() {
    drag.current = null;
    resize.current = null;
    if (draft) {
      let s = draft;
      if (s.kind === "rect" || s.kind === "ellipse")
        s = { ...s, x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      setShapes((prev) => [...prev, s]);
      setDraft(null);
    }
    drawing.current = false;
  }

  function onClickText(e: React.MouseEvent) {
    if (tool !== "text" || textEntry) return;
    const [x, y] = pos(e);
    setTextValue("");
    setTextEntry({ x, y });
  }

  function commitText() {
    if (textEntry && textValue.trim()) {
      setShapes((prev) => [...prev, { kind: "text", x: textEntry.x, y: textEntry.y + 14, text: textValue.trim(), color, size: 16 }]);
    }
    setTextEntry(null);
    setTextValue("");
  }

  const view = ref.current ? { w: ref.current.clientWidth, h: ref.current.clientHeight } : { w: 1000, h: 700 };
  const all = draft ? [...shapes, draft] : shapes;
  const selBox = selected !== null && shapes[selected] ? bbox(shapes[selected]) : null;

  return (
    <div className="absolute inset-0 z-20">
      <div
        ref={ref}
        className={`absolute inset-0 ${tool === "select" ? "cursor-move" : "cursor-crosshair"}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onClick={onClickText}
      >
        <SketchView shapes={all} view={view} width={view.w} height={view.h} />
        {textEntry && (
          <input
            autoFocus
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitText();
              else if (e.key === "Escape") {
                setTextEntry(null);
                setTextValue("");
              }
            }}
            onBlur={commitText}
            placeholder="Type text, Enter to place"
            style={{ left: textEntry.x, top: textEntry.y, color, borderColor: color }}
            className="absolute z-40 min-w-[180px] -translate-y-1/2 rounded border bg-black/80 px-2 py-1 text-sm font-semibold outline-none"
          />
        )}

        {selBox && (
          <svg className="pointer-events-none absolute inset-0" width={view.w} height={view.h}>
            <rect
              x={selBox.x - 6}
              y={selBox.y - 6}
              width={selBox.w + 12}
              height={selBox.h + 12}
              fill="none"
              stroke="#60a5fa"
              strokeDasharray="5 4"
              strokeWidth={1.5}
            />
            {[
              [selBox.x - 6, selBox.y - 6],
              [selBox.x + selBox.w + 6, selBox.y - 6],
              [selBox.x + selBox.w + 6, selBox.y + selBox.h + 6],
              [selBox.x - 6, selBox.y + selBox.h + 6],
            ].map(([hx, hy], i) => (
              <rect key={i} x={hx - 4} y={hy - 4} width={8} height={8} fill="#60a5fa" stroke="#fff" strokeWidth={1} />
            ))}
          </svg>
        )}
      </div>

      <div className="absolute left-1/2 top-16 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-edge bg-panel/95 p-1.5 shadow-lg">
        {(["select", "pencil"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTool(t);
              if (t !== "select") setSelected(null);
            }}
            className={`rounded px-2 py-1 text-sm ${tool === t ? "bg-accent text-white" : "hover:bg-edge"}`}
          >
            {t === "select" ? "✥ Move" : "✏ Pencil"}
          </button>
        ))}

        {/* Shapes dropdown (Rectangle / Circle) */}
        <div className="relative flex">
          <button
            onClick={() => {
              setTool(shape);
              setSelected(null);
            }}
            className={`rounded-l px-2 py-1 text-sm ${tool === "rect" || tool === "ellipse" ? "bg-accent text-white" : "hover:bg-edge"}`}
          >
            {shape === "rect" ? "▭ Box" : "◯ Circle"}
          </button>
          <button
            onClick={() => setShapeMenu((o) => !o)}
            className={`rounded-r px-1 text-xs ${tool === "rect" || tool === "ellipse" ? "bg-accent text-white" : "hover:bg-edge"}`}
            title="Choose shape"
          >
            ▾
          </button>
          {shapeMenu && (
            <div className="absolute left-0 top-full z-10 mt-1 w-28 overflow-hidden rounded-md border border-edge bg-panel py-1 shadow-lg">
              {(["rect", "ellipse"] as const).map((sh) => (
                <button
                  key={sh}
                  onClick={() => {
                    setShape(sh);
                    setTool(sh);
                    setSelected(null);
                    setShapeMenu(false);
                  }}
                  className="block w-full px-3 py-1 text-left text-sm hover:bg-edge"
                >
                  {sh === "rect" ? "▭ Rectangle" : "◯ Circle"}
                </button>
              ))}
            </div>
          )}
        </div>

        {(["arrow", "text"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTool(t);
              setSelected(null);
            }}
            className={`rounded px-2 py-1 text-sm ${tool === t ? "bg-accent text-white" : "hover:bg-edge"}`}
          >
            {t === "arrow" ? "➤ Arrow" : "T Text"}
          </button>
        ))}
        <div className="mx-1 h-5 w-px bg-edge" />
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`h-5 w-5 rounded-full border ${color === c ? "border-white" : "border-transparent"}`}
            style={{ background: c }}
          />
        ))}
        <div className="mx-1 h-5 w-px bg-edge" />
        {onSeverityChange &&
          SEVERITIES.map((s) => (
            <button
              key={s.value}
              onClick={() => onSeverityChange(s.value)}
              className={`rounded px-1.5 py-0.5 text-[11px] ${severity === s.value ? s.cls : "bg-edge text-gray-300"}`}
              title={`Severity: ${s.label}`}
            >
              {s.label}
            </button>
          ))}
        <div className="mx-1 h-5 w-px bg-edge" />
        {selected !== null ? (
          <button
            onClick={() => {
              setShapes((p) => p.filter((_, i) => i !== selected));
              setSelected(null);
            }}
            className="rounded px-2 py-1 text-sm text-red-300 hover:bg-edge"
            title="Delete selected"
          >
            🗑 Delete
          </button>
        ) : (
          <button onClick={() => setShapes((p) => p.slice(0, -1))} className="rounded px-2 py-1 text-sm hover:bg-edge" title="Undo">
            ↶ Undo
          </button>
        )}
        <button
          onClick={() => onSave(shapes, view)}
          disabled={!shapes.length}
          className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-500 disabled:opacity-40"
        >
          Send
        </button>
        <button onClick={onCancel} className="rounded px-2 py-1 text-sm text-gray-300 hover:bg-edge">
          Cancel
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-black/60 px-3 py-1 text-xs text-gray-200">
        Draw, then use ✥ Move to reposition or delete any mark before pressing Send
      </div>
    </div>
  );
}
