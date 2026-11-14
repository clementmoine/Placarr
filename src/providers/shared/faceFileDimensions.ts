/**
 * Probe on-disk face dump dimensions for ranking (before face.json).
 * Raw file pixels (no margin trim) — same contract as cards-index artW/H.
 */
import { existsSync, readFileSync } from "node:fs";

import { readFileRawImageDimensions } from "@/core/enrich/media/imageMetrics";

export async function probeFaceFileDimensions(
  absPath: string,
): Promise<{ width: number; height: number } | null> {
  const dims = await readFileRawImageDimensions(absPath);
  if (!dims?.width || !dims?.height) return null;
  return { width: dims.width, height: dims.height };
}

/**
 * Sync header probe for harvest/resolve paths that must stay synchronous.
 * Supports PNG / GIF / JPEG / WebP — unreadable → null (never invent dims).
 */
export function probeFaceFileDimensionsSync(
  absPath: string,
): { width: number; height: number } | null {
  if (!existsSync(absPath)) return null;
  let buf: Buffer;
  try {
    buf = readFileSync(absPath);
  } catch {
    return null;
  }
  if (buf.length < 24) return null;

  // PNG
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }

  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return {
      width: buf.readUInt16LE(6),
      height: buf.readUInt16LE(8),
    };
  }

  // JPEG — scan SOF0/SOF2
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1]!;
      if (marker === 0xd9 || marker === 0xda) break;
      const len = buf.readUInt16BE(i + 2);
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          height: buf.readUInt16BE(i + 5),
          width: buf.readUInt16BE(i + 7),
        };
      }
      i += 2 + len;
    }
    return null;
  }

  // WebP: RIFF....WEBP
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8X" && buf.length >= 30) {
      const w =
        1 + buf[24]! + (buf[25]! << 8) + (buf[26]! << 16);
      const h =
        1 + buf[27]! + (buf[28]! << 8) + (buf[29]! << 16);
      return { width: w, height: h };
    }
    if (kind === "VP8 " && buf.length >= 30) {
      // lossy bitstream starts at 20; width/height in frame header little-endian 14-bit
      const w = buf.readUInt16LE(26) & 0x3fff;
      const h = buf.readUInt16LE(28) & 0x3fff;
      if (w > 0 && h > 0) return { width: w, height: h };
    }
    if (kind === "VP8L" && buf.length >= 25) {
      const bits = buf.readUInt32LE(21);
      const w = (bits & 0x3fff) + 1;
      const h = ((bits >> 14) & 0x3fff) + 1;
      return { width: w, height: h };
    }
  }

  return null;
}
