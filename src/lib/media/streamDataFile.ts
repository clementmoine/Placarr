/**
 * Stream a file under a data root for ``/uploads`` and ``/foil``.
 * Never buffers the whole body (WebGL packs are multi‑GB).
 */
import { createReadStream, existsSync, statSync, type Stats } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".frag": "text/plain; charset=utf-8",
  ".vert": "text/plain; charset=utf-8",
  ".glsl": "text/plain; charset=utf-8",
  ".astc": "application/octet-stream",
  ".bin": "application/octet-stream",
};

function contentType(filePath: string): string {
  return (
    MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream"
  );
}

/** Resolve ``segments`` under ``root``; null if missing or escapes root. */
export function resolveUnderRoot(
  root: string,
  segments: string[] | undefined,
): string | null {
  if (!segments?.length) return null;
  if (segments.some((s) => s === ".." || s === "." || s.includes("\0"))) {
    return null;
  }
  const rootResolved = path.resolve(root);
  const filePath = path.resolve(rootResolved, ...segments);
  if (
    filePath !== rootResolved &&
    !filePath.startsWith(rootResolved + path.sep)
  ) {
    return null;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return null;
  return filePath;
}

/**
 * How long a caller may keep a copy without asking again.
 *
 * `immutable` is a promise that the bytes behind this URL will never change —
 * only content-addressed names (upload hashes, versioned pack assets) can keep
 * it. Anything the app rewrites under a stable name must say `revalidate`, or
 * the browser is entitled to show last week's file forever.
 */
export type FileCachePolicy = "immutable" | "revalidate";

const CACHE_CONTROL: Record<FileCachePolicy, string> = {
  immutable: "public, max-age=31536000, immutable",
  revalidate: "public, max-age=0, must-revalidate",
};

/** Size + mtime: enough to notice a rewrite, cheap enough to compute per request. */
function entityTag(stat: Stats): string {
  return `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

/** Whether the copy the caller already holds is still the one on disk. */
function isStillFresh(
  request: Request | undefined,
  etag: string,
  mtimeMs: number,
): boolean {
  if (!request) return false;
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) {
    return ifNoneMatch
      .split(",")
      .map((candidate) => candidate.trim().replace(/^W\//, ""))
      .some((candidate) => candidate === etag || candidate === "*");
  }
  const ifModifiedSince = request.headers.get("if-modified-since");
  if (!ifModifiedSince) return false;
  const since = Date.parse(ifModifiedSince);
  // HTTP dates have second precision, so compare on whole seconds.
  return Number.isFinite(since) && Math.floor(mtimeMs / 1000) * 1000 <= since;
}

export function streamFileResponse(
  filePath: string,
  options: { request?: Request; cache?: FileCachePolicy } = {},
): NextResponse {
  const stat = statSync(filePath);
  const etag = entityTag(stat);
  const headers: Record<string, string> = {
    "Content-Type": contentType(filePath),
    "Cache-Control": CACHE_CONTROL[options.cache ?? "immutable"],
    ETag: etag,
    "Last-Modified": new Date(stat.mtimeMs).toUTCString(),
  };

  // A revalidating caller pays one conditional request and gets an empty 304
  // back; without the validators above it would re-download the whole file.
  if (isStillFresh(options.request, etag, stat.mtimeMs)) {
    return new NextResponse(null, { status: 304, headers });
  }

  const stream = createReadStream(filePath);
  const body = Readable.toWeb(stream) as ReadableStream;
  return new NextResponse(body, {
    status: 200,
    headers: { ...headers, "Content-Length": String(stat.size) },
  });
}
