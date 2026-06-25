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
  return (
    <div className="absolute left-11 right-11 top-2 z-10 flex flex-col items-center gap-2 md:left-1/2 md:right-auto md:max-w-[95%] md:-translate-x-1/2">
      <div className="flex w-full items-center gap-1 overflow-x-auto rounded-lg border border-edge bg-panel/90 p-1 shadow-lg backdrop-blur md:w-auto md:flex-wrap md:justify-center md:overflow-visible">
        <button className={btn(tool === "orbit")} onClick={() => onToolChange("orbit")} title="Rotate / Zoom / Pan">
          🖱 Orbit
        </button>
        <button className={btn(tool === "measure")} onClick={() => onToolChange("measure")} title="Measure distance">
          📏 Measure{measureCount ? ` (${measureCount})` : ""}
        </button>
        <button
          className={btn(tool === "section" || section.enabled)}
          onClick={() => {
            onToolChange("section");
            onSectionChange({ ...section, enabled: !section.enabled });
          }}
          title="Section / clip plane"
        >
          ✂ Section
        </button>
        {enableAnnotation && (
          <>
            <button className={btn(tool === "comment")} onClick={() => onToolChange("comment")} title="Place a comment pin">
              📍 Comment
            </button>
            <button className={btn(tool === "sketch")} onClick={() => onToolChange("sketch")} title="Sketch / draw / text">
              ✏ Sketch
            </button>
          </>
        )}
        <div className="mx-1 h-6 w-px bg-edge" />
        <select
          value={displayMode}
          onChange={(e) => onDisplayModeChange(e.target.value as DisplayMode)}
          title="Display mode"
          className="rounded bg-panel px-2 py-1.5 text-sm text-gray-200 outline-none hover:bg-edge"
        >
          <option value="shaded-edges">◧ Shaded + edges</option>
          <option value="shaded">● Shaded</option>
          <option value="wireframe">◇ Wireframe</option>
        </select>
        <div className="mx-1 h-6 w-px bg-edge" />
        <button className={btn(false)} onClick={onResetView} title="Fit model to view">
          ⤢ Fit
        </button>
        <button
          className={btn(showSens)}
          onClick={() => setShowSens((v) => !v)}
          title="Adjust rotate / zoom / pan sensitivity"
        >
          🎚 Sensitivity
        </button>
        {measureCount > 0 && (
          <button className={btn(false)} onClick={onClearMeasurements} title="Clear measurements">
            ✕ Clear
          </button>
        )}
      </div>

      {showSens && (
        <div className="flex items-center gap-3 rounded-lg border border-edge bg-panel/90 px-3 py-2 text-xs text-gray-300 shadow-lg backdrop-blur">
          <span className="uppercase tracking-wide text-gray-400">Sensitivity</span>
          <span>Slow</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={sensitivity}
            onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
            className="w-48 accent-blue-500"
          />
          <span>Fast</span>
          <span className="w-8 text-right text-gray-400">{Math.round(sensitivity * 100)}%</span>
        </div>
      )}

      {section.enabled && bounds && (
        <div className="flex items-center gap-3 rounded-lg border border-edge bg-panel/90 px-3 py-2 text-xs text-gray-300 shadow-lg backdrop-blur">
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
            className="w-48 accent-blue-500"
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
