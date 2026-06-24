import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getProjectAccess, canEdit, logActivity } from "@/lib/access";

const schema = z.object({
  email: z.string().email(),
  permission: z.enum(["view", "comment", "edit"]).default("comment"),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await getProjectAccess(user.id, user.email, id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const shares = await db.share.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ shares });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(user.id, user.email, id);
  if (!access || !canEdit(access.permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const invitedUser = await db.user.findUnique({ where: { email }, select: { id: true } });

  const share = await db.share.upsert({
    where: { projectId_invitedEmail: { projectId: id, invitedEmail: email } },
    update: { permission: parsed.data.permission, userId: invitedUser?.id ?? null },
    create: {
      projectId: id,
      invitedEmail: email,
      userId: invitedUser?.id ?? null,
      permission: parsed.data.permission,
      token: randomUUID(),
    },
  });

  await logActivity(id, user.id, "share", { email, permission: parsed.data.permission });

  // No email is sent. The invitee gains access automatically and sees the project under
  // "Shared with you" once they sign in with this email. Share the link directly if needed.
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return NextResponse.json({ share, link: `${base}/projects/${id}` });
}
