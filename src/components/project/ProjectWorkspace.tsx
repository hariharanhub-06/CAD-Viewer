"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ModelViewer, type ModelSource, type ViewerApi, type PinData } from "@/components/viewer/ModelViewer";
import type { Sketch3D } from "@/lib/cad/sketch3d";
import { PdfViewer } from "@/components/viewer/PdfViewer";
import { uploadFile } from "@/lib/uploadClient";
import type { ApiAnnotation, ApiActivity, ApiShare, ProjectInfo, RevisionInfo } from "@/lib/clientTypes";

interface Props {
  project: ProjectInfo;
  revisions: RevisionInfo[];
  currentUserId: string;
}

const canComment = (p: string) => ["owner", "edit", "comment"].includes(p);
const canEdit = (p: string) => ["owner", "edit"].includes(p);

type Tab = "all" | "comments" | "activity" | "share" | "revisions";

export function ProjectWorkspace({ project, revisions, currentUserId }: Props) {
  const router = useRouter();
  const [activeRevId, setActiveRevId] = useState(revisions[0]?.id);
  const activeRev = revisions.find((r) => r.id === activeRevId) ?? revisions[0];

  const [source, setSource] = useState<ModelSource | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<ApiAnnotation[]>([]);
  const [activities, setActivities] = useState<ApiActivity[]>([]);
  const [shares, setShares] = useState<ApiShare[]>([]);
  const [tab, setTab] = useState<Tab>("comments");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingPin, setPendingPin] = useState<{
    position: [number, number, number];
    component?: string;
    componentMeshIndex?: number;
    camera: any;
  } | null>(null);
  const [composerText, setComposerText] = useState("");
  const [severity, setSeverity] = useState("medium");
  const viewerApiRef = useRef<ViewerApi | null>(null);
  const viewerBoxRef = useRef<HTMLDivElement>(null);
  const thumbDoneRef = useRef(false);

  const writable = canComment(project.permission);
  const editable = canEdit(project.permission);

  // ---- Load the viewable model for the active revision ----
  useEffect(() => {
    if (!activeRev?.viewable) {
      setSource(null);
      return;
    }
    let cancelled = false;
    setModelError(null);
    setSource(null);
    fetch(activeRev.viewable.url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load model (${r.status})`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        if (!cancelled) setSource({ buffer: buf, name: activeRev.viewable!.name });
      })
      .catch((e) => !cancelled && setModelError(e.message));
    return () => {
      cancelled = true;
    };
  }, [activeRevId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Fetch + poll annotations and activity for the active revision ----
  const refreshAnnotations = useCallback(async () => {
    if (!activeRev) return;
    const r = await fetch(`/api/revisions/${activeRev.id}/annotations`);
    if (r.ok) setAnnotations((await r.json()).annotations);
  }, [activeRev]);

  const refreshActivity = useCallback(async () => {
    const r = await fetch(`/api/projects/${project.id}/activity`);
    if (r.ok) setActivities((await r.json()).activities);
  }, [project.id]);

  useEffect(() => {
    refreshAnnotations();
    refreshActivity();
    fetch(`/api/projects/${project.id}/shares`)
      .then((r) => (r.ok ? r.json() : { shares: [] }))
      .then((d) => setShares(d.shares ?? []));
  }, [activeRevId, refreshAnnotations, refreshActivity, project.id]);

  // Poll every 10s so other users' sent markups/comments appear (no websockets needed).
  useEffect(() => {
    const t = setInterval(() => refreshAnnotations(), 10000);
    return () => clearInterval(t);
  }, [refreshAnnotations]);

  // Refresh the activity feed when the Activity or All tab is open.
  useEffect(() => {
    if (tab === "activity" || tab === "all") refreshActivity();
  }, [tab, refreshActivity]);

  // ---- Markup is hidden on the model until a comment is clicked ----
  // Only the selected annotation's pin/sketch is rendered (keeps the model clean and
  // never shows resolved/other markup unless you explicitly select it).
  const pins: PinData[] = useMemo(() => {
    if (!selectedId) return [];
    const idx = annotations.findIndex((a) => a.id === selectedId);
    const a = idx >= 0 ? annotations[idx] : null;
    if (!a || a.type !== "pin3d") return [];
    const geo = safeParse(a.geometry);
    if (!geo?.position) return [];
    return [
      {
        id: a.id,
        position: geo.position,
        label: String(idx + 1),
        severity: a.severity,
        resolved: a.comments[0]?.status === "resolved",
        selected: true,
      },
    ];
  }, [annotations, selectedId]);

  // ---- Place pin → composer ----
  const onPlacePin = useCallback(
    (p: { position: [number, number, number]; component?: string; componentMeshIndex?: number; camera: any }) => {
      setPendingPin(p);
      setComposerText("");
      setTab("comments");
    },
    []
  );

  async function submitPin() {
    if (!pendingPin || !composerText.trim() || !activeRev) return;
    const body = {
      type: "pin3d",
      severity,
      geometry: {
        position: pendingPin.position,
        component: pendingPin.component,
        componentMeshIndex: pendingPin.componentMeshIndex,
      },
      cameraState: pendingPin.camera,
      body: composerText.trim(),
    };
    setPendingPin(null);
    setComposerText("");
    const r = await fetch(`/api/revisions/${activeRev.id}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const data = await r.json().catch(() => ({}));
      await refreshAnnotations();
      refreshActivity();
      if (data.annotation?.id) setSelectedId(data.annotation.id);
    }
  }

  async function submitSketch(sketch: Sketch3D, camera: any) {
    if (!activeRev) return;
    const note = window.prompt("Add a note for this sketch (optional):") || "";
    const r = await fetch(`/api/revisions/${activeRev.id}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "freehand",
        severity,
        geometry: sketch,
        cameraState: camera,
        body: note || undefined,
      }),
    });
    if (r.ok) {
      const data = await r.json().catch(() => ({}));
      await refreshAnnotations();
      refreshActivity();
      if (data.annotation?.id) setSelectedId(data.annotation.id);
    }
  }

  // ---- Click a comment to show its markup on the model + fly to its viewpoint ----
  // Clicking the same one again hides it (toggle).
  const focusAnnotation = useCallback((a: ApiAnnotation) => {
    setSelectedId((prev) => {
      if (prev === a.id) return null;
      const cam = a.cameraState ? safeParse(a.cameraState) : null;
      if (cam && viewerApiRef.current) viewerApiRef.current.setCamera(cam);
      return a.id;
    });
  }, []);

  // Capture a preview thumbnail the first time the model is shown (server only stores it once).
  useEffect(() => {
    if (!source || thumbDoneRef.current) return;
    const t = setTimeout(() => {
      const dataUrl = viewerApiRef.current?.captureThumbnail();
      if (dataUrl) {
        thumbDoneRef.current = true;
        fetch(`/api/projects/${project.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thumbnail: dataUrl }),
        }).catch(() => {});
      }
    }, 1800);
    return () => clearTimeout(t);
  }, [source, project.id]);

  // Only the selected sketch is shown on the model (same rule as pins).
  const sketches: Sketch3D[] = useMemo(() => {
    if (!selectedId) return [];
    const a = annotations.find((x) => x.id === selectedId);
    if (!a || a.type !== "freehand") return [];
    const g = safeParse(a.geometry);
    return g && Array.isArray(g.shapes) ? [g as Sketch3D] : [];
  }, [annotations, selectedId]);

  // body to highlight: the one being commented on, or the selected pin's body
  const highlightMeshIndex = useMemo(() => {
    if (pendingPin) return pendingPin.componentMeshIndex ?? null;
    if (selectedId) {
      const a = annotations.find((x) => x.id === selectedId);
      if (a?.type === "pin3d") {
        const idx = safeParse(a.geometry)?.componentMeshIndex;
        return typeof idx === "number" ? idx : null;
      }
    }
    return null;
  }, [pendingPin, selectedId, annotations]);

  async function deleteAnnotation(id: string) {
    if (!window.confirm("Delete this comment and its replies?")) return;
    const r = await fetch(`/api/annotations/${id}`, { method: "DELETE" });
    if (r.ok) {
      if (selectedId === id) setSelectedId(null);
      refreshAnnotations();
      refreshActivity();
    }
  }

  async function editSeverity(annotationId: string, sev: string) {
    const r = await fetch(`/api/annotations/${annotationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ severity: sev }),
    });
    if (r.ok) refreshAnnotations();
  }

  async function editComment(commentId: string, body: string) {
    const r = await fetch(`/api/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (r.ok) refreshAnnotations();
  }

  async function reply(annotationId: string, text: string) {
    const r = await fetch(`/api/annotations/${annotationId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    if (r.ok) refreshAnnotations();
  }

  async function setCommentStatus(commentId: string, status: "open" | "resolved") {
    const r = await fetch(`/api/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (r.ok) {
      refreshAnnotations();
      refreshActivity();
    }
  }

  const openCount = annotations.filter((a) => a.comments[0] && a.comments[0].status !== "resolved").length;

  return (
    <div className="flex h-full">
      {/* Viewer */}
      <div ref={viewerBoxRef} className="relative min-w-0 flex-1">
        {activeRev?.viewable ? (
          <>
            <ModelViewer
              source={source}
              enableAnnotation={writable}
              pins={pins}
              highlightMeshIndex={highlightMeshIndex}
              onPlacePin={onPlacePin}
              onPinClick={(id) => {
                const a = annotations.find((x) => x.id === id);
                if (a) focusAnnotation(a);
              }}
              sketches={sketches}
              severity={severity}
              onSeverityChange={setSeverity}
              onSketchCommit={({ sketch, camera }) => submitSketch(sketch, camera)}
              onReady={(api) => (viewerApiRef.current = api)}
            />
            {modelError && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded border border-red-700 bg-red-950/80 p-3 text-sm text-red-200">
                {modelError}
              </div>
            )}
          </>
        ) : activeRev?.pdfs[0] ? (
          <PdfViewer url={activeRev.pdfs[0].url} />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">
            No viewable file in this revision (attachments only).
          </div>
        )}
      </div>

      {/* Sidebar */}
      <aside className="flex w-96 shrink-0 flex-col border-l border-edge bg-panel">
        <div className="border-b border-edge px-4 py-3">
          <Link href="/dashboard" className="mb-1 inline-block text-xs text-gray-400 hover:text-accent">
            ← Projects
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="truncate font-semibold" title={project.name}>
              {project.name}
            </h1>
            <span className="shrink-0 rounded bg-edge px-2 py-0.5 text-xs text-gray-300">{project.permission}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <select
              value={activeRevId}
              onChange={(e) => {
                setActiveRevId(e.target.value);
                setSelectedId(null);
              }}
              className="rounded border border-edge bg-ink px-2 py-1 text-sm"
            >
              {revisions.map((r) => (
                <option key={r.id} value={r.id}>
                  Rev {r.version} {r.status === "active" ? "(latest)" : ""}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-500">{openCount} open</span>
            {editable && (
              <button
                onClick={() => setTab("revisions")}
                className="ml-auto rounded bg-gradient-to-r from-brand-violet to-brand-fuchsia px-2.5 py-1 text-xs font-medium text-white"
                title="Upload a corrected version"
              >
                ＋ New version
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-edge text-xs">
          {(["all", "comments", "activity", "share", "revisions"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-1 py-2 capitalize ${tab === t ? "border-b-2 border-accent text-white" : "text-gray-400"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {(() => {
            const commentsEl = (
              <CommentsTab
                annotations={annotations}
                currentUserId={currentUserId}
                writable={writable}
                selectedId={selectedId}
                pendingPin={pendingPin}
                composerText={composerText}
                setComposerText={setComposerText}
                severity={severity}
                setSeverity={setSeverity}
                onSubmitPin={submitPin}
                onCancelPin={() => setPendingPin(null)}
                onFocus={focusAnnotation}
                onReply={reply}
                onSetStatus={setCommentStatus}
                onDelete={deleteAnnotation}
                onEditComment={editComment}
                onEditSeverity={editSeverity}
              />
            );
            const activityEl = <ActivityTab activities={activities} />;
            const shareEl = <ShareTab projectId={project.id} shares={shares} editable={editable} onChange={(s) => setShares(s)} />;
            const revisionsEl = (
              <RevisionsTab project={project} revisions={revisions} editable={editable} onUploaded={() => router.refresh()} />
            );
            if (tab === "comments") return commentsEl;
            if (tab === "activity") return activityEl;
            if (tab === "share") return shareEl;
            if (tab === "revisions") return revisionsEl;
            return (
              <div>
                <SidebarSection title="Comments">{commentsEl}</SidebarSection>
                <SidebarSection title="Activity">{activityEl}</SidebarSection>
                <SidebarSection title="Share">{shareEl}</SidebarSection>
                <SidebarSection title="Revisions">{revisionsEl}</SidebarSection>
              </div>
            );
          })()}
        </div>
      </aside>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-edge">
      <div className="bg-ink/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{title}</div>
      {children}
    </div>
  );
}

const SEVERITIES: { value: string; label: string; cls: string }[] = [
  { value: "low", label: "Low", cls: "bg-slate-600 text-white" },
  { value: "medium", label: "Medium", cls: "bg-blue-600 text-white" },
  { value: "high", label: "High", cls: "bg-amber-500 text-black" },
  { value: "critical", label: "Critical", cls: "bg-red-600 text-white" },
];

function SeverityPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      {SEVERITIES.map((s) => (
        <button
          key={s.value}
          onClick={() => onChange(s.value)}
          className={`rounded px-1.5 py-0.5 text-[11px] ${value === s.value ? s.cls : "bg-edge text-gray-300"}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function SeverityTag({ severity }: { severity: string }) {
  const s = SEVERITIES.find((x) => x.value === severity) ?? SEVERITIES[1];
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${s.cls}`}>{s.label}</span>;
}

function safeParse(s: string | null): any {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ---------- Comments tab ----------
function CommentsTab(props: {
  annotations: ApiAnnotation[];
  currentUserId: string;
  writable: boolean;
  selectedId: string | null;
  pendingPin: any;
  composerText: string;
  setComposerText: (s: string) => void;
  severity: string;
  setSeverity: (s: string) => void;
  onSubmitPin: () => void;
  onCancelPin: () => void;
  onFocus: (a: ApiAnnotation) => void;
  onReply: (id: string, text: string) => void;
  onSetStatus: (commentId: string, status: "open" | "resolved") => void;
  onDelete: (annotationId: string) => void;
  onEditComment: (commentId: string, body: string) => void;
  onEditSeverity: (annotationId: string, sev: string) => void;
}) {
  const { annotations } = props;
  const [filter, setFilter] = useState<string>("all");
  const FILTERS = [
    { v: "all", l: "All" },
    { v: "low", l: "Low" },
    { v: "medium", l: "Med" },
    { v: "high", l: "High" },
    { v: "critical", l: "Crit" },
  ];
  const filtered = annotations.filter((a) => filter === "all" || a.severity === filter);
  return (
    <div className="space-y-3 p-3">
      {props.writable && (
        <div className="flex items-center gap-2 rounded bg-ink px-2 py-1.5">
          <span className="text-xs text-gray-400">Severity for new markup:</span>
          <SeverityPicker value={props.severity} onChange={props.setSeverity} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="text-gray-400">Filter:</span>
        {FILTERS.map((f) => {
          const count = f.v === "all" ? annotations.length : annotations.filter((a) => a.severity === f.v).length;
          return (
            <button
              key={f.v}
              onClick={() => setFilter(f.v)}
              className={`rounded px-1.5 py-0.5 ${filter === f.v ? "bg-accent text-white" : "bg-edge text-gray-300"}`}
            >
              {f.l} {count}
            </button>
          );
        })}
      </div>

      {props.pendingPin && (
        <div className="rounded border border-accent bg-ink p-2">
          <div className="mb-1 text-xs text-accent">New comment on selected part</div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-gray-400">Severity:</span>
            <SeverityPicker value={props.severity} onChange={props.setSeverity} />
          </div>
          <textarea
            autoFocus
            value={props.composerText}
            onChange={(e) => props.setComposerText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                props.onSubmitPin();
              }
            }}
            rows={3}
            className="w-full rounded border border-edge bg-panel px-2 py-1 text-sm outline-none"
            placeholder="Describe the issue… (Enter to send, Shift+Enter for new line)"
          />
          <div className="mt-1 flex justify-end gap-2">
            <button onClick={props.onCancelPin} className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-edge">
              Cancel
            </button>
            <button
              onClick={props.onSubmitPin}
              disabled={!props.composerText.trim()}
              className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-500 disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 && !props.pendingPin && (
        <p className="px-1 text-sm text-gray-500">
          {annotations.length === 0
            ? props.writable
              ? "No comments yet. Use the 📍 Comment or ✏ Sketch tools on the model to add one."
              : "No comments yet."
            : "No comments match this filter."}
        </p>
      )}

      {filtered.map((a) => (
        <AnnotationCard
          key={a.id}
          index={annotations.findIndex((x) => x.id === a.id) + 1}
          annotation={a}
          selected={a.id === props.selectedId}
          writable={props.writable}
          currentUserId={props.currentUserId}
          onFocus={() => props.onFocus(a)}
          onReply={props.onReply}
          onSetStatus={props.onSetStatus}
          onDelete={props.onDelete}
          onEditComment={props.onEditComment}
          onEditSeverity={props.onEditSeverity}
        />
      ))}
    </div>
  );
}

function AnnotationCard({
  index,
  annotation,
  selected,
  writable,
  currentUserId,
  onFocus,
  onReply,
  onSetStatus,
  onDelete,
  onEditComment,
  onEditSeverity,
}: {
  index: number;
  annotation: ApiAnnotation;
  selected: boolean;
  writable: boolean;
  currentUserId: string;
  onFocus: () => void;
  onReply: (id: string, text: string) => void;
  onSetStatus: (commentId: string, status: "open" | "resolved") => void;
  onDelete: (annotationId: string) => void;
  onEditComment: (commentId: string, body: string) => void;
  onEditSeverity: (annotationId: string, sev: string) => void;
}) {
  const [replyText, setReplyText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [sevOpen, setSevOpen] = useState(false);
  const root = annotation.comments[0];
  const resolved = root?.status === "resolved";
  const component = annotation.type === "pin3d" ? safeParse(annotation.geometry)?.component : null;
  const typeLabel =
    annotation.type === "pin3d" ? "📍 Pin" : annotation.type === "freehand" ? "✏ Sketch" : annotation.type;
  const canDelete = writable; // server authorizes (author or editor/owner)

  return (
    <div className={`rounded border bg-ink p-2 ${selected ? "border-accent" : "border-edge"} ${resolved ? "opacity-70" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-gray-400">
          <button onClick={onFocus} className="shrink-0 hover:text-accent">
            #{index} · {typeLabel}
          </button>
          {writable ? (
            <button onClick={() => setSevOpen((o) => !o)} title="Change severity">
              <SeverityTag severity={annotation.severity} />
            </button>
          ) : (
            <SeverityTag severity={annotation.severity} />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {root && writable && (
            <button
              onClick={() => onSetStatus(root.id, resolved ? "open" : "resolved")}
              className={`rounded px-2 py-0.5 text-xs ${resolved ? "bg-edge text-gray-300" : "bg-green-700 text-white hover:bg-green-600"}`}
            >
              {resolved ? "Reopen" : "Resolve"}
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(annotation.id)}
              className="rounded px-1.5 py-0.5 text-xs text-red-300 hover:bg-edge"
              title="Delete comment"
            >
              🗑
            </button>
          )}
        </div>
      </div>

      {sevOpen && writable && (
        <div className="mt-2 flex gap-1">
          {SEVERITIES.map((s) => (
            <button
              key={s.value}
              onClick={() => {
                onEditSeverity(annotation.id, s.value);
                setSevOpen(false);
              }}
              className={`rounded px-1.5 py-0.5 text-[11px] ${annotation.severity === s.value ? s.cls : "bg-edge text-gray-300"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {component && <div className="mt-1 truncate text-[11px] text-gray-500">on: {component}</div>}

      {annotation.comments.map((c) => (
        <div key={c.id} className="mt-2 border-t border-edge pt-2 first:border-0 first:pt-1">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400">
              {c.author.name || c.author.email} · {new Date(c.createdAt).toLocaleString()}
              {c.status === "resolved" && <span className="ml-1 text-green-400">· resolved</span>}
            </div>
            {writable && c.author.id === currentUserId && editingId !== c.id && (
              <button
                onClick={() => {
                  setEditingId(c.id);
                  setEditText(c.body);
                }}
                className="text-[11px] text-gray-500 hover:text-accent"
              >
                edit
              </button>
            )}
          </div>
          {editingId === c.id ? (
            <div className="mt-1">
              <textarea
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (editText.trim()) onEditComment(c.id, editText.trim());
                    setEditingId(null);
                  }
                }}
                rows={2}
                className="w-full rounded border border-edge bg-panel px-2 py-1 text-sm outline-none"
              />
              <div className="mt-1 flex justify-end gap-2">
                <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:underline">
                  cancel
                </button>
                <button
                  onClick={() => {
                    if (editText.trim()) onEditComment(c.id, editText.trim());
                    setEditingId(null);
                  }}
                  className="rounded bg-accent px-2 py-0.5 text-xs text-white"
                >
                  save
                </button>
              </div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap text-sm text-gray-100">{c.body}</div>
          )}
        </div>
      ))}

      {writable && (
        <div className="mt-2 flex gap-1">
          <textarea
            rows={1}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (replyText.trim()) {
                  onReply(annotation.id, replyText.trim());
                  setReplyText("");
                }
              }
            }}
            placeholder="Reply… (Shift+Enter for new line)"
            className="flex-1 resize-y rounded border border-edge bg-panel px-2 py-1 text-xs outline-none"
          />
        </div>
      )}
    </div>
  );
}

// ---------- Activity tab ----------
function ActivityTab({ activities }: { activities: ApiActivity[] }) {
  if (!activities.length) return <p className="p-3 text-sm text-gray-500">No activity yet.</p>;
  return (
    <ul className="space-y-2 p-3 text-sm">
      {activities.map((a) => (
        <li key={a.id} className="flex gap-2">
          <span className="text-gray-500">{new Date(a.createdAt).toLocaleString()}</span>
          <span className="text-gray-200">
            <strong>{a.actor.name || a.actor.email}</strong> {describeActivity(a)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function describeActivity(a: ApiActivity): string {
  const p = a.payload ? JSON.parse(a.payload) : {};
  switch (a.type) {
    case "upload":
      return `uploaded revision ${p.version}`;
    case "new-revision":
      return `uploaded revision ${p.version}${p.note ? ` — "${p.note}"` : ""}`;
    case "comment":
      return p.reply ? "replied to a comment" : "added a comment";
    case "resolve":
      return "resolved a comment";
    case "reopen":
      return "reopened a comment";
    case "edit":
      return "edited a comment";
    case "delete":
      return "deleted a comment";
    case "share":
      return `shared with ${p.email} (${p.permission})`;
    case "unshare":
      return `removed ${p.email}'s access`;
    default:
      return a.type;
  }
}

// ---------- Share tab ----------
function ShareTab({
  projectId,
  shares,
  editable,
  onChange,
}: {
  projectId: string;
  shares: ApiShare[];
  editable: boolean;
  onChange: (s: ApiShare[]) => void;
}) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState("comment");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/projects/${projectId}/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, permission }),
    });
    setBusy(false);
    if (r.ok) {
      setEmail("");
      setMsg("Access granted. They'll see it under “Shared with you” after signing in with this email.");
      const list = await fetch(`/api/projects/${projectId}/shares`).then((x) => x.json());
      onChange(list.shares ?? []);
    } else {
      const d = await r.json().catch(() => ({}));
      setMsg(d.error || "Failed to share.");
    }
  }

  async function copyLink() {
    const link = `${window.location.origin}/projects/${projectId}`;
    try {
      await navigator.clipboard.writeText(link);
      setMsg("Link copied. Only people you've granted access (signed in) can open it.");
    } catch {
      setMsg(link);
    }
  }

  async function refreshShares() {
    const d = await fetch(`/api/projects/${projectId}/shares`).then((r) => r.json());
    onChange(d.shares ?? []);
  }
  async function changePermission(shareId: string, permission: string) {
    await fetch(`/api/projects/${projectId}/shares/${shareId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permission }),
    });
    refreshShares();
  }
  async function removeShare(shareId: string, email: string) {
    if (!window.confirm(`Remove ${email}'s access?`)) return;
    await fetch(`/api/projects/${projectId}/shares/${shareId}`, { method: "DELETE" });
    refreshShares();
  }

  return (
    <div className="p-3">
      {editable ? (
        <form onSubmit={invite} className="space-y-2">
          <p className="text-sm text-gray-300">
            Grant access by email. They must sign in with that email to view — no email is sent, so
            send them the link yourself.
          </p>
          <button
            type="button"
            onClick={copyLink}
            className="w-full rounded border border-edge py-1.5 text-sm text-gray-200 hover:bg-edge"
          >
            🔗 Copy project link
          </button>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@company.com"
            className="w-full rounded border border-edge bg-ink px-2 py-1.5 text-sm outline-none"
          />
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value)}
            className="w-full rounded border border-edge bg-ink px-2 py-1.5 text-sm"
          >
            <option value="view">Can view</option>
            <option value="comment">Can comment</option>
            <option value="edit">Can edit (upload revisions)</option>
          </select>
          <button
            disabled={busy}
            className="w-full rounded bg-accent py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send invite"}
          </button>
          {msg && <p className="text-xs text-gray-400">{msg}</p>}
        </form>
      ) : (
        <p className="text-sm text-gray-500">Only the owner can manage sharing.</p>
      )}

      <div className="mt-4">
        <h3 className="mb-2 text-xs uppercase tracking-wide text-gray-400">People with access</h3>
        <ul className="space-y-1 text-sm">
          {shares.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded bg-ink px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate">{s.invitedEmail}</span>
              {editable ? (
                <div className="flex shrink-0 items-center gap-1">
                  <select
                    value={s.permission}
                    onChange={(e) => changePermission(s.id, e.target.value)}
                    className="rounded border border-edge bg-panel px-1 py-0.5 text-xs outline-none"
                  >
                    <option value="view">view</option>
                    <option value="comment">comment</option>
                    <option value="edit">edit</option>
                  </select>
                  <button
                    onClick={() => removeShare(s.id, s.invitedEmail)}
                    className="rounded px-1.5 py-0.5 text-xs text-red-300 hover:bg-edge"
                    title="Remove access"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <span className="shrink-0 text-xs text-gray-400">{s.permission}</span>
              )}
            </li>
          ))}
          {shares.length === 0 && <li className="text-xs text-gray-500">Not shared yet.</li>}
        </ul>
      </div>
    </div>
  );
}

// ---------- Revisions tab ----------
function RevisionsTab({
  project,
  revisions,
  editable,
  onUploaded,
}: {
  project: ProjectInfo;
  revisions: RevisionInfo[];
  editable: boolean;
  onUploaded: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const metas = [];
      for (const f of Array.from(files)) metas.push(await uploadFile(f));
      const r = await fetch(`/api/projects/${project.id}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: metas, note: note || undefined }),
      });
      if (r.ok) {
        setNote("");
        onUploaded();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-3">
      {editable && (
        <div className="mb-4 rounded border border-edge bg-ink p-2">
          <h3 className="mb-1 text-sm font-medium">Upload corrected revision</h3>
          <p className="mb-2 text-xs text-gray-500">
            After addressing comments, upload the new file as a revision. The previous version is kept.
          </p>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What changed? (optional)"
            className="mb-2 w-full rounded border border-edge bg-panel px-2 py-1 text-xs outline-none"
          />
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded bg-accent px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Choose files"}
          </button>
        </div>
      )}

      <ul className="space-y-2 text-sm">
        {revisions.map((r) => (
          <li key={r.id} className="rounded bg-ink px-2 py-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Rev {r.version}</span>
              <span className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleString()}</span>
            </div>
            <div className="text-xs text-gray-400">by {r.uploaderEmail}</div>
            {r.note && <div className="mt-1 text-xs text-gray-300">“{r.note}”</div>}
            {r.attachments.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2">
                {r.attachments.map((f) => (
                  <a key={f.url} href={f.url} className="text-xs text-accent hover:underline" download>
                    ⬇ {f.name}
                  </a>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
