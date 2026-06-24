import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { logActivity } from "@/lib/access";

const fileSchema = z.object({
  key: z.string(),
  originalName: z.string(),
  format: z.string(),
  kind: z.enum(["viewable3d", "pdf", "attachment"]),
  sizeBytes: z.number().int().nonnegative().default(0),
});

const schema = z.object({
  name: z.string().min(1).max(200),
  files: z.array(fileSchema).min(1),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
  }

  const { name, files } = parsed.data;
  const project = await db.project.create({
    data: {
      name,
      ownerId: user.id,
      revisions: {
        create: {
          version: 1,
          uploaderId: user.id,
          files: {
            create: files.map((f) => ({
              storageKey: f.key,
              originalName: f.originalName,
              format: f.format,
              kind: f.kind,
              sizeBytes: f.sizeBytes,
            })),
          },
        },
      },
    },
    include: { revisions: true },
  });

  await logActivity(project.id, user.id, "upload", {
    version: 1,
    fileNames: files.map((f) => f.originalName),
  });

  return NextResponse.json({ projectId: project.id });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await db.project.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    include: { revisions: { orderBy: { version: "desc" }, take: 1 } },
  });

  const sharedProjectIds = await db.share.findMany({
    where: { OR: [{ userId: user.id }, { invitedEmail: user.email.toLowerCase() }] },
    select: { projectId: true },
  });
  const shared = await db.project.findMany({
    where: { id: { in: sharedProjectIds.map((s) => s.projectId) } },
    orderBy: { createdAt: "desc" },
    include: { revisions: { orderBy: { version: "desc" }, take: 1 }, owner: { select: { email: true } } },
  });

  return NextResponse.json({ owned, shared });
}
