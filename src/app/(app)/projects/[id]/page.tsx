import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getProjectAccess } from "@/lib/access";
import { getDownloadUrl } from "@/lib/storage";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";
import { AccessDenied } from "@/components/AccessDenied";
import type { RevisionInfo } from "@/lib/clientTypes";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const access = await getProjectAccess(user.id, user.email, id);
  if (!access) {
    // distinguish "no access" from "doesn't exist" so the user gets a useful message
    const exists = await db.project.findUnique({ where: { id }, select: { id: true } });
    if (!exists) notFound();
    return <AccessDenied email={user.email} />;
  }

  const project = await db.project.findUnique({
    where: { id },
    include: {
      revisions: {
        orderBy: { version: "desc" },
        include: {
          files: true,
          uploader: { select: { email: true } },
        },
      },
    },
  });
  if (!project) notFound();

  const revisions: RevisionInfo[] = await Promise.all(
    project.revisions.map(async (rev) => {
      const withUrls = await Promise.all(
        rev.files.map(async (f) => ({ ...f, url: await getDownloadUrl(f.storageKey) }))
      );
      const viewableFile = withUrls.find((f) => f.kind === "viewable3d");
      return {
        id: rev.id,
        version: rev.version,
        status: rev.status,
        note: rev.note,
        createdAt: rev.createdAt.toISOString(),
        uploaderEmail: rev.uploader.email,
        viewable: viewableFile ? { url: viewableFile.url, name: viewableFile.originalName } : null,
        pdfs: withUrls.filter((f) => f.kind === "pdf").map((f) => ({ url: f.url, name: f.originalName })),
        attachments: withUrls.filter((f) => f.kind === "attachment").map((f) => ({ url: f.url, name: f.originalName })),
      };
    })
  );

  return (
    <ProjectWorkspace
      project={{
        id: project.id,
        name: project.name,
        isOwner: access.isOwner,
        permission: access.permission,
      }}
      revisions={revisions}
      currentUserId={user.id}
    />
  );
}
