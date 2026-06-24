import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { putObject, isLocalStorage } from "@/lib/storage";

// Dev-only: receives raw file bytes and writes them to local disk storage.
// In production (R2) the browser uploads directly to a presigned URL instead.
export async function POST(req: Request) {
  if (!isLocalStorage) {
    return NextResponse.json({ error: "Local upload disabled" }, { status: 400 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key || !key.startsWith(`uploads/${user.id}/`)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }
  const buf = Buffer.from(await req.arrayBuffer());
  await putObject(key, buf, req.headers.get("content-type") || undefined);
  return NextResponse.json({ ok: true, size: buf.length });
}

// Allow larger request bodies for local dev uploads.
export const maxDuration = 60;
