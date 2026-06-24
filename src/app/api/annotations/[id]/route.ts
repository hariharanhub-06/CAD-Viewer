import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getProjectAccess, canEdit, logActivity } from "@/lib/access";

const patchSchema = z.object({ severity: z.enum(["low", "medium", "high", "critical"]) });

// Update an annotation's severity (author or editor/owner).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const annotation = await db.annotation.findUnique({
    where: { id },
    select: { authorId: true, revision: { select: { projectId: true } } },
  });
  if (!annotation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const projectId = annotation.revision.projectId;

  const access = await getProjectAccess(user.id, user.email, projectId);
  if (!access || (annotation.authorId !== user.id && !canEdit(access.permission))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid severity" }, { status: 400 });

  await db.annotation.update({ where: { id }, data: { severity: parsed.data.severity } });
  return NextResponse.json({ ok: true });
}

// Delete an annotation (and its comment thread). Allowed for the author or an editor/owner.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const annotation = await db.annotation.findUnique({
    where: { id },
    select: { authorId: true, revision: { select: { projectId: true } } },
  });
  if (!annotation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const projectId = annotation.revision.projectId;
  const access = await getProjectAccess(user.id, user.email, projectId);
  if (!access || (annotation.authorId !== user.id && !canEdit(access.permission))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.annotation.delete({ where: { id } });
  await logActivity(projectId, user.id, "delete", { annotationId: id });
  return NextResponse.json({ ok: true });
}
