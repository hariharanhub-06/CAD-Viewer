import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/session";
import { createUploadTarget } from "@/lib/storage";
import { extOf } from "@/lib/cad/types";

// Returns a storage key + a target the browser uploads the file bytes to.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { filename, contentType } = await req.json().catch(() => ({}));
  if (!filename) return NextResponse.json({ error: "filename required" }, { status: 400 });

  const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `uploads/${user.id}/${randomUUID()}/${safe}`;
  const target = await createUploadTarget(key, contentType || "application/octet-stream");

  return NextResponse.json({ key, ext: extOf(safe), ...target });
}
