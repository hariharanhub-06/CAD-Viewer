import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getProjectAccess, canComment, logActivity } from "@/lib/access";

const createSchema = z.object({
  type: z.enum(["pin3d", "text", "freehand", "shape", "measurement", "pdf-markup"]),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  geometry: z.any(),
  cameraState: z.any().optional(),
  page: z.number().int().optional(),
  body: z.string().max(2000).optional(),
});

async function revisionProjectId(revisionId: string): Promise<string | null> {
  const rev = await db.revision.findUnique({ where: { id: revisionId }, select: { projectId: true } });
  return rev?.projectId ?? null;
}

// List all annotations + comments for a revision (used on load and by polling).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = await revisionProjectId(id);
  if (!projectId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await getProjectAccess(user.id, user.email, projectId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const annotations = await db.annotation.findMany({
    where: { revisionId: id },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true, email: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  return NextResponse.json({ annotations });
}

// Create an annotation (this is the "Send" action — only now does it become visible to others).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = await revisionProjectId(id);
  if (!projectId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await getProjectAccess(user.id, user.email, projectId);
  if (!access || !canComment(access.permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
  }

  const annotation = await db.annotation.create({
    data: {
      revisionId: id,
      authorId: user.id,
      type: parsed.data.type,
      severity: parsed.data.severity,
      geometry: JSON.stringify(parsed.data.geometry),
      cameraState: parsed.data.cameraState ? JSON.stringify(parsed.data.cameraState) : null,
      page: parsed.data.page ?? null,
      comments: parsed.data.body
        ? { create: { authorId: user.id, body: parsed.data.body } }
        : undefined,
    },
    include: {
      author: { select: { id: true, name: true, email: true } },
      comments: { include: { author: { select: { id: true, name: true, email: true } } } },
    },
  });

  await logActivity(projectId, user.id, "comment", { type: parsed.data.type });
  return NextResponse.json({ annotation });
}
