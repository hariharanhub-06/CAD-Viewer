import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getProjectAccess, canEdit, logActivity } from "@/lib/access";

const schema = z.object({
  note: z.string().max(500).optional(),
  files: z
    .array(
      z.object({
        key: z.string(),
        originalName: z.string(),
        format: z.string(),
        kind: z.enum(["viewable3d", "pdf", "attachment"]),
        sizeBytes: z.number().int().nonnegative().default(0),
      })
    )
    .min(1),
});

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

  const last = await db.revision.findFirst({
    where: { projectId: id },
    orderBy: { version: "desc" },
  });
  const version = (last?.version ?? 0) + 1;

  // Mark older revisions superseded.
  await db.revision.updateMany({ where: { projectId: id }, data: { status: "superseded" } });

  const revision = await db.revision.create({
    data: {
      projectId: id,
      version,
      uploaderId: user.id,
      status: "active",
      note: parsed.data.note,
      files: {
        create: parsed.data.files.map((f) => ({
          storageKey: f.key,
          originalName: f.originalName,
          format: f.format,
          kind: f.kind,
          sizeBytes: f.sizeBytes,
        })),
      },
    },
  });

  await logActivity(id, user.id, "new-revision", {
    version,
    note: parsed.data.note,
    fileNames: parsed.data.files.map((f) => f.originalName),
  });

  return NextResponse.json({ revisionId: revision.id, version });
}
