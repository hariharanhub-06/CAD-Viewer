"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface ProjectStats {
  open: number;
  resolved: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
}

const SEV: { key: keyof ProjectStats; label: string; cls: string }[] = [
  { key: "low", label: "L", cls: "bg-slate-600" },
  { key: "medium", label: "M", cls: "bg-blue-600" },
  { key: "high", label: "H", cls: "bg-amber-500" },
  { key: "critical", label: "C", cls: "bg-red-600" },
];

export function ProjectCardClient({
  id,
  name,
  version,
  thumbnail,
  stats,
  isOwner,
  subtitle,
  gradient,
}: {
  id: string;
  name: string;
  version: number;
  thumbnail: string | null;
  stats: ProjectStats;
  isOwner: boolean;
  subtitle?: string;
  gradient: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  function open() {
    router.push(`/projects/${id}`);
  }

  async function copyLink(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/projects/${id}`);
    } catch {}
  }

  async function del(e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm(`Delete project "${name}"? This removes all revisions and comments.`)) return;
    setBusy(true);
    const r = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (r.ok) router.refresh();
    else setBusy(false);
  }

  const totalSev = stats.low + stats.medium + stats.high + stats.critical;

  return (
    <div
      onClick={open}
      className={`card-glow group cursor-pointer overflow-hidden rounded-xl border border-edge bg-panel ${busy ? "opacity-50" : ""}`}
    >
      {/* preview */}
      <div className="relative aspect-[16/10] bg-ink">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient} opacity-30`}>
            <span className="text-4xl">🧊</span>
          </div>
        )}
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button onClick={copyLink} title="Copy share link" className="rounded bg-black/60 px-2 py-1 text-xs text-white hover:bg-black/80">
            🔗
          </button>
          {isOwner && (
            <button onClick={del} title="Delete project" className="rounded bg-black/60 px-2 py-1 text-xs text-red-300 hover:bg-red-900/80">
              🗑
            </button>
          )}
        </div>
        <span className={`absolute bottom-2 left-2 rounded-md bg-gradient-to-r ${gradient} px-2 py-0.5 text-[11px] font-semibold text-white`}>
          v{version}
        </span>
      </div>

      {/* body */}
      <div className="p-4">
        <div className="truncate font-medium text-gray-100">{name}</div>
        {subtitle && <div className="text-xs text-gray-400">{subtitle}</div>}

        <div className="mt-3 flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-amber-300">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> {stats.open} open
          </span>
          <span className="flex items-center gap-1 text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> {stats.resolved} resolved
          </span>
        </div>

        {/* severity split bar */}
        {totalSev > 0 && (
          <div className="mt-2">
            <div className="flex h-2 overflow-hidden rounded-full bg-edge">
              {SEV.map((s) =>
                stats[s.key] ? (
                  <div key={s.key} className={s.cls} style={{ width: `${(stats[s.key] / totalSev) * 100}%` }} title={`${s.label}: ${stats[s.key]}`} />
                ) : null
              )}
            </div>
            <div className="mt-1 flex gap-2 text-[10px] text-gray-400">
              {SEV.map((s) => (
                <span key={s.key}>
                  {s.label} {stats[s.key]}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
