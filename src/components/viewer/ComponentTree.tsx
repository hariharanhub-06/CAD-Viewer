"use client";

import { useState } from "react";
import type { AssemblyNode } from "@/lib/cad/types";
import { collectMeshes } from "@/lib/cad/loadModel";

interface Props {
  node: AssemblyNode;
  depth: number;
  version: number; // bump to force re-render after external visibility changes
  onToggle: (node: AssemblyNode, visible: boolean) => void;
  onIsolate: (node: AssemblyNode) => void;
}

function nodeVisible(node: AssemblyNode): boolean {
  return collectMeshes(node).some((m) => m.visible);
}

export function ComponentTree({ node, depth, version, onToggle, onIsolate }: Props) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const visible = nodeVisible(node);

  return (
    <div className="select-none text-sm">
      <div
        className="group flex items-center gap-1 px-2 py-[3px] hover:bg-edge"
        style={{ paddingLeft: depth * 12 + 6 }}
      >
        {hasChildren ? (
          <button
            onClick={() => setOpen((o) => !o)}
            className="w-4 shrink-0 text-gray-500 hover:text-gray-200"
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <button
          onClick={() => onToggle(node, !visible)}
          className={`w-5 shrink-0 ${visible ? "text-gray-300" : "text-gray-600"}`}
          title={visible ? "Hide" : "Show"}
        >
          {visible ? "👁" : "—"}
        </button>

        <span className={`flex-1 truncate ${visible ? "text-gray-200" : "text-gray-600"}`} title={node.name}>
          {node.name}
        </span>

        <button
          onClick={() => onIsolate(node)}
          className="hidden shrink-0 rounded px-1 text-[10px] uppercase text-gray-400 hover:bg-ink hover:text-accent group-hover:block"
          title="Isolate this component"
        >
          isolate
        </button>
      </div>

      {open &&
        node.children.map((child) => (
          <ComponentTree
            key={child.id}
            node={child}
            depth={depth + 1}
            version={version}
            onToggle={onToggle}
            onIsolate={onIsolate}
          />
        ))}
    </div>
  );
}
