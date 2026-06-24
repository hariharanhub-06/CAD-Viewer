import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getProjectAccess, canComment, logActivity } from "@/lib/access";

const schema = z.object({ body: z.string().min(1).max(2000) });

// Reply to an annotation thread.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const annotation = await db.annotation.findUnique({
    where: { id },
    select: { revision: { select: { projectId: true } } },
  });
  if (!annotation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getProjectAccess(user.id, user.email, annotation.revision.projectId);
  if (!access || !canComment(access.permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Comment body required" }, { status: 400 });
  }

  const comment = await db.comment.create({
    data: { annotationId: id, authorId: user.id, body: parsed.data.body },
    include: { author: { select: { id: true, name: true, email: true } } },
  });
  await logActivity(annotation.revision.projectId, user.id, "comment", { reply: true });
  return NextResponse.json({ comment });
}
