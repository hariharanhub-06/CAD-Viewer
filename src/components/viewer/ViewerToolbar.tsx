"use client";

import { useState } from "react";

export type Tool = "orbit" | "measure" | "section" | "comment" | "sketch";
export type DisplayMode = "shaded-edges" | "shaded" | "wireframe";

interface SectionState {
  enabled: boolean;
  axis: "x" | "y" | "z";
  position: number;
  flip: boolean;
}

interface Props {
  tool: Tool;
  onToolChange: (t: Tool) => void;
  onResetView: () => void;
  onClearMeasurements: () => void;
  measureCount: number;
  section: SectionState;
  onSectionChange: (s: SectionState) => void;
  bounds: { min: number; max: number; center: number } | null;
  enableAnnotation?: boolean;
  displayMode: DisplayMode;
  onDisplayModeChange: (m: DisplayMode) => void;
  sensitivity: number;
  onSensitivityChange: (n: number) => void;
}

const btn = (active: boolean) =>
  `rounded px-3 py-1.5 text-sm transition-colors ${
    active ? "bg-accent text-white" : "bg-panel text-gray-300 hover:bg-edge"
  }`;

export function ViewerToolbar({
  tool,
  onToolChange,
  onResetView,
  onClearMeasurements,
  measureCount,
  section,
  onSectionChange,
  bounds,
  enableAnnotation,
  displayMode,
  onDisplayModeChange,
  sensitivity,
  onSensitivityChange,
}: Props) {
  const [showSens, setShowSens] = useState(false);
  const lbl = "hidden md:inline";
  return (
    // Bottom icon bar on phones (thumb-reachable), centered top bar with labels on desktop.
    <div className="absolute inset-x-2 bottom-2 z-10 flex flex-col-reverse items-center gap-2 md:inset-x-auto md:bottom-auto md:left-1/2 md:top-2 md:max-w-[95%] md:flex-col md:-translate-x-1/2">
      <div className="flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-edge bg-panel/95 p-1 shadow-lg backdrop-blur md:w-auto md:flex-wrap md:justify-center md:overflow-visible">
        <button className={btn(tool === "orbit")} onClick={() => onToolChange("orbit")} title="Rotate / Zoom / Pan">
          🖱<span className={lbl}> Orbit</span>
        </button>
        <button className={btn(tool === "measure")} onClick={() => onToolChange("measure")} title="Measure distance">
          📏<span className={lbl}> Measure</span>{measureCount ? ` (${measureCount})` : ""}
        </button>
        <button
          className={btn(tool === "section" || section.enabled)}
          onClick={() => {
            onToolChange("section");
            onSectionChange({ ...section, enabled: !section.enabled });
          }}
          title="Section / clip plane"
        >
          ✂<span className={lbl}> Section</span>
        </button>
        {enableAnnotation && (
          <>
            <button className={btn(tool === "comment")} onClick={() => onToolChange("comment")} title="Place a comment pin">
              📍<span className={lbl}> Comment</span>
            </button>
            <button className={btn(tool === "sketch")} onClick={() => onToolChange("sketch")} title="Sketch / draw / text">
              ✏<span className={lbl}> Sketch</span>
            </button>
          </>
        )}
        <div className="mx-1 hidden h-6 w-px bg-edge md:block" />
        <select
          value={displayMode}
          onChange={(e) => onDisplayModeChange(e.target.value as DisplayMode)}
          title="Display mode"
          className="shrink-0 rounded bg-panel px-2 py-1.5 text-sm text-gray-200 outline-none hover:bg-edge"
        >
          <option value="shaded-edges">◧ Shaded + edges</option>
          <option value="shaded">● Shaded</option>
          <option value="wireframe">◇ Wireframe</option>
        </select>
        <div className="mx-1 hidden h-6 w-px bg-edge md:block" />
        <button className={btn(false)} onClick={onResetView} title="Fit model to view">
          ⤢<span className={lbl}> Fit</span>
        </button>
        <button className={btn(showSens)} onClick={() => setShowSens((v) => !v)} title="Adjust rotate / zoom / pan sensitivity">
          🎚<span className={lbl}> Sensitivity</span>
        </button>
        {measureCount > 0 && (
          <button className={btn(false)} onClick={onClearMeasurements} title="Clear measurements">
            ✕<span className={lbl}> Clear</span>
          </button>
        )}
      </div>

      {showSens && (
        <div className="flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-edge bg-panel/95 px-3 py-2 text-xs text-gray-300 shadow-lg backdrop-blur">
          <span className="uppercase tracking-wide text-gray-400">Sensitivity</span>
          <span>Slow</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={sensitivity}
            onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
            className="w-32 accent-blue-500 md:w-48"
          />
          <span>Fast</span>
          <span className="w-8 text-right text-gray-400">{Math.round(sensitivity * 100)}%</span>
        </div>
      )}

      {section.enabled && bounds && (
        <div className="flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-edge bg-panel/95 px-3 py-2 text-xs text-gray-300 shadow-lg backdrop-blur">
          <span className="uppercase tracking-wide text-gray-400">Plane</span>
          {(["x", "y", "z"] as const).map((ax) => (
            <button
              key={ax}
              className={`rounded px-2 py-0.5 uppercase ${
                section.axis === ax ? "bg-accent text-white" : "bg-ink text-gray-300 hover:bg-edge"
              }`}
              onClick={() => onSectionChange({ ...section, axis: ax })}
            >
              {ax}
            </button>
          ))}
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={(bounds.max - bounds.min) / 200 || 1}
            value={section.position}
            onChange={(e) => onSectionChange({ ...section, position: parseFloat(e.target.value) })}
            className="w-32 accent-blue-500 md:w-48"
          />
          <button
            className="rounded bg-ink px-2 py-0.5 hover:bg-edge"
            onClick={() => onSectionChange({ ...section, flip: !section.flip })}
            title="Flip side"
          >
            ⇋ Flip
          </button>
        </div>
      )}
    </div>
  );
}
