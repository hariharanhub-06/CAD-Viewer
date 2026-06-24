import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getProjectAccess, canEdit } from "@/lib/access";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  // data URL; only set once (when not already present)
  thumbnail: z.string().max(400_000).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(user.id, user.email, id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const data: { name?: string; thumbnail?: string } = {};
  if (parsed.data.name !== undefined) {
    if (!canEdit(access.permission)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    data.name = parsed.data.name;
  }
  if (parsed.data.thumbnail !== undefined) {
    // only set the preview if it isn't already captured
    const existing = await db.project.findUnique({ where: { id }, select: { thumbnail: true } });
    if (!existing?.thumbnail) data.thumbnail = parsed.data.thumbnail;
  }
  if (Object.keys(data).length) await db.project.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

// Delete a project (owner only). Cascades revisions/files/annotations/shares/activity.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(user.id, user.email, id);
  if (!access || !access.isOwner) return NextResponse.json({ error: "Only the owner can delete" }, { status: 403 });

  await db.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
