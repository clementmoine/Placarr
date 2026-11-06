/**
 * PDF (and image) document previews for catalogue browse —
 * sibling `*.thumb.webp` next to the source under `documents/{lang}/{kind}/`.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { renderPageAsImage } from "unpdf";

import {
  documentThumbRelativePath,
  resolvePackDocumentFile,
  type PackDocumentEntry,
} from "@/lib/admin/packDocuments";

export { documentThumbRelativePath };

const THUMB_MAX_EDGE = 480;

export function documentThumbUrl(
  packId: string,
  thumbRelativePath: string,
): string {
  return `/api/admin/pack-documents/file?pack=${encodeURIComponent(packId)}&path=${encodeURIComponent(thumbRelativePath)}`;
}

async function rasterizePdfFirstPage(pdfBytes: Buffer): Promise<Buffer> {
  const png = await renderPageAsImage(new Uint8Array(pdfBytes), 1, {
    canvasImport: () => import("@napi-rs/canvas"),
    scale: 1.5,
  });
  return Buffer.from(png);
}

async function toThumbWebp(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({
      width: THUMB_MAX_EDGE,
      height: THUMB_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 78 })
    .toBuffer();
}

/**
 * Ensure a WebP preview exists for a harvested document. Returns the thumb
 * relative path, or null when the source cannot be previewed (URL-only, etc.).
 */
export async function ensurePackDocumentThumb(opts: {
  packId: string;
  relativePath: string;
  force?: boolean;
}): Promise<string | null> {
  const thumbRel = documentThumbRelativePath(opts.relativePath);
  if (!thumbRel) return null;

  const sourceAbs = resolvePackDocumentFile(opts.packId, opts.relativePath);
  if (!sourceAbs) return null;

  // resolvePackDocumentFile requires the file to exist — build path for write.
  const absOut = path.join(path.dirname(sourceAbs), path.basename(thumbRel));
  if (!opts.force && existsSync(absOut)) {
    return thumbRel;
  }

  const ext = path.extname(sourceAbs).toLowerCase();
  let raster: Buffer;
  if (ext === ".pdf") {
    raster = await rasterizePdfFirstPage(readFileSync(sourceAbs));
  } else if (
    ext === ".png" ||
    ext === ".jpg" ||
    ext === ".jpeg" ||
    ext === ".webp"
  ) {
    raster = readFileSync(sourceAbs);
  } else {
    return null;
  }

  const webp = await toThumbWebp(raster);
  writeFileSync(absOut, webp);
  return thumbRel;
}

/** Attach `thumbRelativePath` when the sibling already exists on disk. */
export function attachExistingDocumentThumb(
  packId: string,
  entry: PackDocumentEntry,
): PackDocumentEntry & { thumbRelativePath: string | null } {
  if (!entry.relativePath) {
    return { ...entry, thumbRelativePath: null };
  }
  const thumbRel = documentThumbRelativePath(entry.relativePath);
  if (!thumbRel) return { ...entry, thumbRelativePath: null };
  const abs = resolvePackDocumentFile(packId, thumbRel);
  return { ...entry, thumbRelativePath: abs ? thumbRel : null };
}
