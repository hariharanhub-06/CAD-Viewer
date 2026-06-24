import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getProjectAccess, canComment, logActivity } from "@/lib/access";

const schema = z
  .object({
    status: z.enum(["open", "resolved"]).optional(),
    body: z.string().min(1).max(2000).optional(),
  })
  .refine((d) => d.status !== undefined || d.body !== undefined, { message: "Nothing to update" });

// Resolve/reopen a comment, or edit its body (body edits: author only).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const comment = await db.comment.findUnique({
    where: { id },
    select: { authorId: true, annotation: { select: { revision: { select: { projectId: true } } } } },
  });
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const projectId = comment.annotation.revision.projectId;

  const access = await getProjectAccess(user.id, user.email, projectId);
  if (!access || !canComment(access.permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Editing the text is restricted to the comment's author.
  if (parsed.data.body !== undefined) {
    if (comment.authorId !== user.id) {
      return NextResponse.json({ error: "Only the author can edit this comment" }, { status: 403 });
    }
    const updated = await db.comment.update({ where: { id }, data: { body: parsed.data.body } });
    await logActivity(projectId, user.id, "edit", { commentId: id });
    return NextResponse.json({ comment: updated });
  }

  const status = parsed.data.status!;
  const updated = await db.comment.update({
    where: { id },
    data:
      status === "resolved"
        ? { status: "resolved", resolvedById: user.id, resolvedAt: new Date() }
        : { status: "open", resolvedById: null, resolvedAt: null },
  });
  await logActivity(projectId, user.id, status === "resolved" ? "resolve" : "reopen", { commentId: id });
  return NextResponse.json({ comment: updated });
}
