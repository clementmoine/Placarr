import crypto from "crypto";
import fs from "fs";
import path from "path";

import { coverDownloadCandidates } from "@/core/enrich/media/coverDownloadCandidates";

const LOCAL_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
] as const;

export type CachedRemoteImageUpload = {
  absolutePath: string;
  publicPath: string;
  contentType: string;
  buffer: Buffer;
};

function uploadsDir(): string {
  return path.join(process.cwd(), "public", "uploads");
}

function contentTypeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return "image/jpeg";
  }
}

function extFromContentTypeOrUrl(
  contentType: string | undefined,
  sourceUrl: string,
): string {
  const fromType = contentType?.toLowerCase();
  if (fromType?.includes("png")) return ".png";
  if (fromType?.includes("gif")) return ".gif";
  if (fromType?.includes("webp")) return ".webp";
  if (fromType?.includes("svg")) return ".svg";
  try {
    const ext = path.extname(new URL(sourceUrl).pathname).toLowerCase();
    if (
      (LOCAL_IMAGE_EXTENSIONS as readonly string[]).includes(ext) &&
      ext !== ".jpeg"
    ) {
      return ext === ".jpeg" ? ".jpg" : ext;
    }
    if (ext === ".jpeg") return ".jpg";
  } catch {
    // ignore
  }
  return ".jpg";
}

/**
 * Look up a previously localized copy of this remote URL (same hash scheme as
 * `downloadRemoteImage` — md5 of the URL / cover candidates).
 */
export function findCachedRemoteImageUpload(
  url: string,
): CachedRemoteImageUpload | null {
  const dir = uploadsDir();
  if (!fs.existsSync(dir)) return null;

  for (const candidate of coverDownloadCandidates(url)) {
    const hash = crypto.createHash("md5").update(candidate).digest("hex");
    for (const ext of LOCAL_IMAGE_EXTENSIONS) {
      const absolutePath = path.join(dir, `${hash}${ext}`);
      if (!fs.existsSync(absolutePath)) continue;
      try {
        const buffer = fs.readFileSync(absolutePath);
        if (buffer.length === 0) continue;
        return {
          absolutePath,
          publicPath: `/uploads/${hash}${ext}`,
          contentType: contentTypeForExt(ext),
          buffer,
        };
      } catch {
        continue;
      }
    }
  }
  return null;
}

/**
 * Persist proxy/localizer bytes under the stable URL hash so the next
 * `/api/media/remote` hit (and metadata localize) can skip upstream.
 */
export function persistRemoteImageUpload(
  url: string,
  buffer: Buffer,
  options: { contentType?: string; sourceUrl?: string } = {},
): CachedRemoteImageUpload {
  const dir = uploadsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const ext = extFromContentTypeOrUrl(
    options.contentType,
    options.sourceUrl ?? url,
  );
  const hash = crypto.createHash("md5").update(url).digest("hex");
  const filename = `${hash}${ext}`;
  const absolutePath = path.join(dir, filename);

  if (!fs.existsSync(absolutePath)) {
    fs.writeFileSync(absolutePath, buffer);
  }

  return {
    absolutePath,
    publicPath: `/uploads/${filename}`,
    contentType: contentTypeForExt(ext),
    buffer,
  };
}
