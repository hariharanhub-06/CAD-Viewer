import "server-only";
import { promises as fs } from "fs";
import path from "path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const driver = process.env.STORAGE_DRIVER || "local";
const LOCAL_DIR = path.join(process.cwd(), "storage");

// Works with any S3-compatible provider (Backblaze B2, Cloudflare R2, Supabase, MinIO, …).
// Set S3_ENDPOINT to the provider's S3 endpoint, e.g.:
//   Backblaze B2: https://s3.us-east-005.backblazeb2.com
//   Cloudflare R2: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
function r2Client(): S3Client {
  const endpoint =
    process.env.S3_ENDPOINT ||
    `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint,
    forcePathStyle: true,
    // The AWS SDK v3 default adds an x-amz-checksum-* header into the signature, which the
    // browser PUT to a presigned URL never sends → 403 on B2/R2/MinIO. Only add it when required.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

const BUCKET = process.env.R2_BUCKET || "cad-models";

export const isLocalStorage = driver === "local";

/**
 * Where the browser should upload a file.
 * - r2: a presigned PUT URL the browser uploads to directly (avoids Vercel's 4.5MB body limit).
 * - local: our own API route that streams the body to disk (dev only).
 */
export async function createUploadTarget(
  key: string,
  contentType: string
): Promise<{ url: string; method: "PUT" | "POST"; driver: string }> {
  if (driver === "r2") {
    const url = await getSignedUrl(
      r2Client(),
      new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: 600 }
    );
    return { url, method: "PUT", driver };
  }
  return { url: `/api/upload/local?key=${encodeURIComponent(key)}`, method: "POST", driver };
}

/** A URL the browser can fetch the object from. */
export async function getDownloadUrl(key: string): Promise<string> {
  if (driver === "r2") {
    if (process.env.R2_PUBLIC_BASE_URL) {
      return `${process.env.R2_PUBLIC_BASE_URL}/${key}`;
    }
    return await getSignedUrl(
      r2Client(),
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
      { expiresIn: 3600 }
    );
  }
  return `/api/files/${key}`;
}

/** Server-side write (used by the local upload route). */
export async function putObject(key: string, body: Buffer, contentType?: string): Promise<void> {
  if (driver === "r2") {
    await r2Client().send(
      new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType })
    );
    return;
  }
  const full = path.join(LOCAL_DIR, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body);
}

/** Server-side read (used by the local download route). */
export async function getObject(key: string): Promise<Buffer> {
  if (driver === "r2") {
    const res = await r2Client().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
  return await fs.readFile(path.join(LOCAL_DIR, key));
}

export async function deleteObject(key: string): Promise<void> {
  if (driver === "r2") {
    await r2Client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    return;
  }
  try {
    await fs.unlink(path.join(LOCAL_DIR, key));
  } catch {
    /* ignore missing */
  }
}
