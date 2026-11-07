/**
 * PDF (and image) document previews for catalogue browse —
 * sibling `*.thumb.webp` next to the source under `documents/{lang}/{kind}/`.
 *
 * Primary path: unpdf first-page raster. Fallback for truncated / linearized
 * dumps that pdf.js rejects: largest embedded DCTDecode JPEG or FlateDecode
 * Image XObject (common on old Carddass FR scans).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";

import sharp from "sharp";
import { renderPageAsImage } from "unpdf";

import {
  documentThumbRelativePath,
  resolvePackDocumentFile,
  type PackDocumentEntry,
} from "@/lib/admin/packDocuments";

export { documentThumbRelativePath };

const THUMB_MAX_EDGE = 480;
/** Ignore tiny icons / logos when picking an embed for the preview. */
const MIN_EMBED_PIXELS = 40_000;

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

function readPdfNameInt(header: string, key: string): number | null {
  const match = header.match(new RegExp(`/${key}\\s+(\\d+)`));
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function streamPayloadAfter(
  pdf: Buffer,
  streamKeywordAt: number,
  length: number | null,
): Buffer | null {
  const head = pdf.subarray(streamKeywordAt, streamKeywordAt + 16);
  const crlf = head.indexOf(0x0a);
  if (crlf < 0) return null;
  const dataStart = streamKeywordAt + crlf + 1;
  if (length != null && length >= 0) {
    return pdf.subarray(dataStart, dataStart + length);
  }
  const end = pdf.indexOf("endstream", dataStart);
  if (end < 0) return null;
  let data = pdf.subarray(dataStart, end);
  if (data.length >= 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) {
    data = data.subarray(0, data.length - 2);
  } else if (data.length >= 1 && (data[data.length - 1] === 0x0a || data[data.length - 1] === 0x0d)) {
    data = data.subarray(0, data.length - 1);
  }
  return data;
}

/** Undo PDF / PNG predictors (1–4 and 10–15). */
function undoPdfPredictor(
  data: Buffer,
  width: number,
  colors: number,
  predictor: number,
): Buffer {
  if (predictor < 2) return data;
  const rowBytes = width * colors;
  // PNG-style predictors (10–15) prefix each row with a filter byte.
  const pngStyle = predictor >= 10;
  if (!pngStyle) {
    // TIFF predictor 2 = horizontal differencing.
    if (predictor !== 2) return data;
    const out = Buffer.from(data);
    for (let y = 0; y * rowBytes < out.length; y += 1) {
      const row = y * rowBytes;
      for (let x = colors; x < rowBytes && row + x < out.length; x += 1) {
        out[row + x] = (out[row + x]! + out[row + x - colors]!) & 255;
      }
    }
    return out;
  }

  const out = Buffer.alloc(Math.floor(data.length / (rowBytes + 1)) * rowBytes);
  let src = 0;
  let dst = 0;
  const prev = Buffer.alloc(rowBytes);
  while (src + 1 + rowBytes <= data.length) {
    const filt = data[src]!;
    src += 1;
    const row = Buffer.from(data.subarray(src, src + rowBytes));
    src += rowBytes;
    if (filt === 1) {
      for (let x = 0; x < rowBytes; x += 1) {
        const left = x >= colors ? row[x - colors]! : 0;
        row[x] = (row[x]! + left) & 255;
      }
    } else if (filt === 2) {
      for (let x = 0; x < rowBytes; x += 1) {
        row[x] = (row[x]! + prev[x]!) & 255;
      }
    } else if (filt === 3) {
      for (let x = 0; x < rowBytes; x += 1) {
        const left = x >= colors ? row[x - colors]! : 0;
        row[x] = (row[x]! + ((left + prev[x]!) >> 1)) & 255;
      }
    } else if (filt === 4) {
      for (let x = 0; x < rowBytes; x += 1) {
        const left = x >= colors ? row[x - colors]! : 0;
        const up = prev[x]!;
        const upLeft = x >= colors ? prev[x - colors]! : 0;
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const pr =
          pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        row[x] = (row[x]! + pr) & 255;
      }
    } else if (filt !== 0) {
      return data;
    }
    row.copy(out, dst);
    row.copy(prev, 0);
    dst += rowBytes;
  }
  return out.subarray(0, dst);
}

function cmykToRgb(cmyk: Buffer, pixels: number): Buffer {
  const rgb = Buffer.alloc(pixels * 3);
  for (let i = 0; i < pixels; i += 1) {
    const c = cmyk[i * 4]! / 255;
    const m = cmyk[i * 4 + 1]! / 255;
    const y = cmyk[i * 4 + 2]! / 255;
    const k = cmyk[i * 4 + 3]! / 255;
    rgb[i * 3] = Math.round(255 * (1 - c) * (1 - k));
    rgb[i * 3 + 1] = Math.round(255 * (1 - m) * (1 - k));
    rgb[i * 3 + 2] = Math.round(255 * (1 - y) * (1 - k));
  }
  return rgb;
}

type PdfEmbedCandidate = {
  pixels: number;
  kind: "jpeg" | "raw";
  buffer: Buffer;
  width?: number;
  height?: number;
  channels?: number;
};

/**
 * Scan Image XObjects for a previewable embed (DCT JPEG or Flate raw).
 * Used when the PDF trailer is truncated and unpdf cannot open the file.
 */
export function extractLargestPdfEmbed(pdf: Buffer): PdfEmbedCandidate | null {
  let best: PdfEmbedCandidate | null = null;
  const marker = Buffer.from("/Subtype");
  let from = 0;
  while (from < pdf.length) {
    const at = pdf.indexOf(marker, from);
    if (at < 0) break;
    from = at + marker.length;
    const around = pdf
      .subarray(at, Math.min(pdf.length, at + 64))
      .toString("latin1");
    if (!/\/Subtype\s*\/Image/.test(around)) continue;

    const streamAt = pdf.indexOf(Buffer.from("stream"), at);
    if (streamAt < 0 || streamAt - at > 800) continue;
    /*
      Match the Image dict that closes just before `stream`, walking `<<`/`>>`
      so nested `/DecodeParms<<…>>` does not steal `/Length`.
    */
    let i = streamAt - 1;
    while (
      i >= 0 &&
      (pdf[i] === 0x20 ||
        pdf[i] === 0x0d ||
        pdf[i] === 0x0a ||
        pdf[i] === 0x09)
    ) {
      i -= 1;
    }
    if (i < 1 || pdf[i - 1] !== 0x3e || pdf[i] !== 0x3e) continue;
    i -= 2;
    let depth = 1;
    let dictStart = -1;
    while (i >= 1) {
      if (pdf[i - 1] === 0x3e && pdf[i] === 0x3e) {
        depth += 1;
        i -= 2;
        continue;
      }
      if (pdf[i - 1] === 0x3c && pdf[i] === 0x3c) {
        depth -= 1;
        if (depth === 0) {
          dictStart = i - 1;
          break;
        }
        i -= 2;
        continue;
      }
      i -= 1;
    }
    if (dictStart < 0) continue;
    const header = pdf.subarray(dictStart, streamAt).toString("latin1");
    if (!/\/Subtype\s*\/Image/.test(header)) continue;

    const width = readPdfNameInt(header, "Width");
    const height = readPdfNameInt(header, "Height");
    const length = readPdfNameInt(header, "Length");
    if (!width || !height || width * height < MIN_EMBED_PIXELS) continue;

    const payload = streamPayloadAfter(pdf, streamAt, length);
    if (!payload || payload.length < 64) continue;

    const isDct = /\/DCTDecode/.test(header);
    const isFlate = /\/FlateDecode/.test(header);
    if (isDct) {
      if (payload[0] !== 0xff || payload[1] !== 0xd8) continue;
      const candidate: PdfEmbedCandidate = {
        pixels: width * height,
        kind: "jpeg",
        buffer: payload,
      };
      if (!best || candidate.pixels > best.pixels) best = candidate;
      continue;
    }
    if (!isFlate) continue;

    let colors = readPdfNameInt(header, "Colors");
    if (/\/DeviceCMYK/.test(header)) colors = colors ?? 4;
    else if (/\/DeviceGray/.test(header)) colors = colors ?? 1;
    else if (/\/DeviceRGB/.test(header)) colors = colors ?? 3;
    else continue;
    if (colors !== 1 && colors !== 3 && colors !== 4) continue;

    let raw: Buffer;
    try {
      raw = inflateSync(payload);
    } catch {
      continue;
    }
    const predictor = readPdfNameInt(header, "Predictor") ?? 1;
    try {
      raw = undoPdfPredictor(raw, width, colors, predictor);
    } catch {
      continue;
    }
    const need = width * height * colors;
    if (raw.length < need) continue;
    raw = raw.subarray(0, need);

    let rgb: Buffer;
    let channels: number;
    if (colors === 4) {
      rgb = cmykToRgb(raw, width * height);
      channels = 3;
    } else {
      rgb = raw;
      channels = colors;
    }
    const candidate: PdfEmbedCandidate = {
      pixels: width * height,
      kind: "raw",
      buffer: rgb,
      width,
      height,
      channels,
    };
    if (!best || candidate.pixels > best.pixels) best = candidate;
  }
  return best;
}

async function rasterizePdfEmbeddedFallback(
  pdfBytes: Buffer,
): Promise<Buffer | null> {
  const embed = extractLargestPdfEmbed(pdfBytes);
  if (!embed) return null;
  if (embed.kind === "jpeg") return embed.buffer;
  if (
    embed.width == null ||
    embed.height == null ||
    embed.channels == null
  ) {
    return null;
  }
  return sharp(embed.buffer, {
    raw: {
      width: embed.width,
      height: embed.height,
      channels: embed.channels as 1 | 3 | 4,
    },
  })
    .png()
    .toBuffer();
}

async function rasterizePdf(pdfBytes: Buffer): Promise<Buffer> {
  try {
    return await rasterizePdfFirstPage(pdfBytes);
  } catch {
    const fallback = await rasterizePdfEmbeddedFallback(pdfBytes);
    if (fallback) return fallback;
    throw new Error("Invalid PDF structure.");
  }
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
    raster = await rasterizePdf(readFileSync(sourceAbs));
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
