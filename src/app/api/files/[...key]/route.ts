import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getProjectAccess } from "@/lib/access";
import { getObject } from "@/lib/storage";

// Serves stored file bytes for the local storage driver, gated by project access.
// (In production with R2 the browser uses a presigned URL and never hits this route.)
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params;
  const key = parts.map(decodeURIComponent).join("/");

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find which project this file belongs to and check access.
  const file = await db.file.findFirst({
    where: { storageKey: key },
    select: { revision: { select: { projectId: true } }, originalName: true, format: true },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getProjectAccess(user.id, user.email, file.revision.projectId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const buf = await getObject(key);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `inline; filename="${file.originalName}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
