import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getProjectAccess, canEdit, logActivity } from "@/lib/access";

const patchSchema = z.object({ permission: z.enum(["view", "comment", "edit"]) });

async function authorize(projectId: string, shareId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" as const, status: 401 };
  const access = await getProjectAccess(user.id, user.email, projectId);
  if (!access || !canEdit(access.permission)) return { error: "Forbidden" as const, status: 403 };
  const share = await db.share.findUnique({ where: { id: shareId } });
  if (!share || share.projectId !== projectId) return { error: "Not found" as const, status: 404 };
  return { user, share };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; shareId: string }> }) {
  const { id, shareId } = await params;
  const auth = await authorize(id, shareId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid permission" }, { status: 400 });

  await db.share.update({ where: { id: shareId }, data: { permission: parsed.data.permission } });
  await logActivity(id, auth.user.id, "share", { email: auth.share.invitedEmail, permission: parsed.data.permission });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; shareId: string }> }) {
  const { id, shareId } = await params;
  const auth = await authorize(id, shareId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await db.share.delete({ where: { id: shareId } });
  await logActivity(id, auth.user.id, "unshare", { email: auth.share.invitedEmail });
  return NextResponse.json({ ok: true });
}
