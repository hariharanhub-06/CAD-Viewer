import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getProjectAccess } from "@/lib/access";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await getProjectAccess(user.id, user.email, id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const activities = await db.activity.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { name: true, email: true } } },
  });
  return NextResponse.json({ activities });
}
