import crypto from "crypto";
import fs from "fs";
import path from "path";

import sharp from "sharp";
import {
  applyMaskCoverage,
  lumaOf,
  normalMapCoverage,
  type MaskKind,
} from "@/core/enrich/media/maskCoverage";
import { uploadsDir } from "@/lib/runtimeData";

export type { MaskKind } from "@/core/enrich/media/maskCoverage";
export { lumaOf, normalMapCoverage } from "@/core/enrich/media/maskCoverage";

/**
 * Turning a published mask into something both CSS and the Unity shaders wear.
 *
 * Prefer storing publisher JPEGs under `/assets/<pack>/cards/…` and converting
 * at display time (`maskBlobStore` / Safari alpha). This server bake remains
 * for legacy `/uploads/` localize of remote hotlinks.
 *
 * Formulas match the publisher's `generate Safari mask` (BT.601 luma for foil;
 * normal-map coverage for varnish).
 */

const MASK_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function extensionFor(url: string): string {
  const guess = path.extname(new URL(url).pathname).toLowerCase();
  return MASK_EXTENSIONS.has(guess) ? guess : ".jpg";
}

/**
 * Where a mask lands under uploads. The kind is part of the hash.
 * Always lossless WebP — the output carries an alpha channel.
 */
export function maskUploadPath(url: string, kind: MaskKind): string {
  const hash = crypto
    .createHash("md5")
    .update(`${url}#${kind}#v3-webp`)
    .digest("hex");
  return `/uploads/${hash}.webp`;
}

/** @internal exposed so the extension policy stays testable. */
export function sourceExtension(url: string): string {
  return extensionFor(url);
}

/** Bake coverage into alpha; keep RGB for Unity `.xyz` sampling. */
export async function bakeMask(input: Buffer, kind: MaskKind): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = new Uint8ClampedArray(info.width * info.height * 4);
  for (let index = 0; index < info.width * info.height; index += 1) {
    const at = index * info.channels;
    const dest = index * 4;
    out[dest] = data[at]!;
    out[dest + 1] = data[at + 1]!;
    out[dest + 2] = data[at + 2]!;
    out[dest + 3] = data[at + 3] ?? 255;
  }
  applyMaskCoverage(out, kind);

  // Lossless WebP drops RGB under alpha=0. Unity varnish still samples `.xyz`
  // on zero-coverage texels for bevels — keep a 1/255 alpha so RGB survives.
  for (let index = 0; index < info.width * info.height; index += 1) {
    const dest = index * 4;
    if (
      out[dest + 3] === 0 &&
      (out[dest]! | out[dest + 1]! | out[dest + 2]!)
    ) {
      out[dest + 3] = 1;
    }
  }

  return sharp(Buffer.from(out), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
}

/**
 * The local copy of a mask, downloading and baking it if this is the first time.
 *
 * `/assets/` and `/uploads/` are already on our origin — returned as-is (no bake).
 * Pack cards should be raw JPEGs converted client-side for CSS.
 */
export async function localizeMaskImage(
  url: string,
  options: { kind: MaskKind; signal?: AbortSignal },
): Promise<string | null> {
  if (!url.startsWith("http")) {
    if (url.startsWith("/uploads/") || url.startsWith("/assets/")) return url;
    return null;
  }

  const relativePath = maskUploadPath(url, options.kind);
  const targetDir = uploadsDir();
  const targetPath = path.join(targetDir, path.basename(relativePath));

  if (fs.existsSync(targetPath)) return relativePath;

  try {
    const response = await fetch(url, { signal: options.signal });
    if (!response.ok) return null;
    const downloaded = Buffer.from(await response.arrayBuffer());
    const baked = await bakeMask(downloaded, options.kind);

    await fs.promises.mkdir(targetDir, { recursive: true });
    await fs.promises.writeFile(targetPath, baked);
    return relativePath;
  } catch {
    return null;
  }
}
