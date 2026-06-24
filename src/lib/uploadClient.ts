"use client";

import { classifyFormat, extOf } from "@/lib/cad/types";

export interface UploadedFileMeta {
  key: string;
  originalName: string;
  format: string;
  kind: "viewable3d" | "pdf" | "attachment";
  sizeBytes: number;
}

// Uploads one file: get a target, push bytes to it (B2 presigned PUT or local POST) with
// progress reporting, and return the metadata needed to create File records.
export async function uploadFile(file: File, onProgress?: (fraction: number) => void): Promise<UploadedFileMeta> {
  const signRes = await fetch("/api/upload/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream" }),
  });
  if (!signRes.ok) throw new Error("Failed to get upload URL");
  const { key, url, method } = await signRes.json();
  const target = url.startsWith("http") ? url : `${window.location.origin}${url}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, target);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.send(file);
  });
  onProgress?.(1);

  const ext = extOf(file.name);
  return { key, originalName: file.name, format: ext, kind: classifyFormat(ext), sizeBytes: file.size };
}
