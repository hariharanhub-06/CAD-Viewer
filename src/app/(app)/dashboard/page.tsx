import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { NewUploadButton } from "@/components/UploadModal";
import { ProjectCardClient, type ProjectStats } from "@/components/ProjectCardClient";

export const dynamic = "force-dynamic";

const GRADIENTS = [
  "from-brand-violet to-brand-fuchsia",
  "from-brand-blue to-brand-cyan",
  "from-brand-emerald to-brand-cyan",
  "from-brand-amber to-brand-rose",
  "from-brand-fuchsia to-brand-blue",
];
function gradientFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

async function getStats(projectIds: string[]): Promise<Record<string, ProjectStats>> {
  const empty = (): ProjectStats => ({ open: 0, resolved: 0, low: 0, medium: 0, high: 0, critical: 0 });
  const map: Record<string, ProjectStats> = {};
  for (const id of projectIds) map[id] = empty();
  if (!projectIds.length) return map;

  const anns = await db.annotation.findMany({
    where: { revision: { projectId: { in: projectIds } } },
    select: {
      severity: true,
      revision: { select: { projectId: true } },
      comments: { orderBy: { createdAt: "asc" }, take: 1, select: { status: true } },
    },
  });
  for (const a of anns) {
    const s = map[a.revision.projectId];
    if (!s) continue;
    if (a.comments[0]?.status === "resolved") s.resolved++;
    else s.open++;
    const sev = (a.severity as keyof ProjectStats) || "medium";
    if (sev in s) (s as any)[sev]++;
  }
  return map;
}

export default async function DashboardPage() {
  const user = (await getCurrentUser())!;

  const owned = await db.project.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    include: { revisions: { orderBy: { version: "desc" }, take: 1 } },
  });
  const shareLinks = await db.share.findMany({
    where: { OR: [{ userId: user.id }, { invitedEmail: user.email.toLowerCase() }] },
    select: { projectId: true },
  });
  const shared = await db.project.findMany({
    where: { id: { in: shareLinks.map((s) => s.projectId) }, ownerId: { not: user.id } },
    orderBy: { createdAt: "desc" },
    include: { revisions: { orderBy: { version: "desc" }, take: 1 }, owner: { select: { email: true } } },
  });

  const stats = await getStats([...owned, ...shared].map((p) => p.id));

  return (
    <main className="h-full overflow-y-auto">
      <div className="aurora border-b border-edge">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Your <span className="gradient-text">CAD projects</span>
            </h1>
            <p className="mt-1 text-sm text-gray-400">Upload, view, measure and review — all in the browser.</p>
          </div>
          <NewUploadButton />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Owned by you</h2>
          {owned.length === 0 ? (
            <div className="rounded-xl border border-dashed border-edge bg-panel/50 p-10 text-center">
              <div className="text-4xl">🧊</div>
              <p className="mt-2 text-gray-300">No projects yet</p>
              <p className="text-sm text-gray-500">Use “Upload model” above to create your first one.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {owned.map((p) => (
                <ProjectCardClient
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  version={p.revisions[0]?.version ?? 1}
                  thumbnail={p.thumbnail}
                  stats={stats[p.id]}
                  isOwner
                  gradient={gradientFor(p.id)}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Shared with you</h2>
          {shared.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing shared with you yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {shared.map((p) => (
                <ProjectCardClient
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  version={p.revisions[0]?.version ?? 1}
                  thumbnail={p.thumbnail}
                  stats={stats[p.id]}
                  isOwner={false}
                  subtitle={`by ${p.owner.email}`}
                  gradient={gradientFor(p.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
