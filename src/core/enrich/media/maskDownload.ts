import crypto from "crypto";
import fs from "fs";
import path from "path";

import sharp from "sharp";

/**
 * Turning a published mask into something both CSS and the Unity shaders wear.
 *
 * `mask-mode: luminance` is parsed by Safari, reported as supported by
 * `CSS.supports`, and returned by `getComputedStyle` — and not applied to an
 * image mask. The mask means nothing, so the layer covers the entire card:
 * artwork, text box, borders.
 *
 * The publisher does not rely on it either. Their viewer converts each mask,
 * client-side on a canvas, into a PNG whose **alpha** carries the coverage,
 * then masks with that — the default alpha path, which every engine has
 * supported for years. Their own function is named `generate Safari mask`.
 *
 * We do the same conversion, once, at download, with the formulas read off their
 * bundle rather than guessed — and we keep the RGB the Unity fragments need,
 * because those sample `.xyz` (foil coverage, varnish normals), never alpha:
 *
 * - **Foil:** `coverage = 0.299R + 0.587G + 0.114B` (BT.601 luma). Written to
 *   both RGB (as greyscale) and alpha. CSS reads alpha; Unity reads `.xyz`.
 * - **Varnish:** the file is a *normal map*. RGB is kept verbatim so Unity's
 *   bevel math (`* 2 - 1` on RG, Z as height) still works; alpha gets
 *   `max(0, x+y+z) * 255` for the CSS coat. An earlier bake that flattened RGB
 *   to white made every Unity varnish sample as a flat normal and every foil
 *   mask as "everywhere".
 */

/** Which conversion a mask needs, named for what the file *is*. */
export type MaskKind = "foil" | "varnish";

/** Extensions we are willing to read, keyed off the source URL. */
const MASK_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function extensionFor(url: string): string {
  const guess = path.extname(new URL(url).pathname).toLowerCase();
  return MASK_EXTENSIONS.has(guess) ? guess : ".jpg";
}

/**
 * Where a mask lands. The kind is part of the hash: the same file can serve as
 * both a foil mask and a varnish one, and the two bakes must not collide.
 *
 * `v2` busts the first bake that wrote solid-white RGB — fine for CSS alpha,
 * unusable for Unity fragments that sample `.xyz`.
 *
 * Always PNG — the output carries an alpha channel, which JPEG has no room for.
 */
export function maskUploadPath(url: string, kind: MaskKind): string {
  const hash = crypto
    .createHash("md5")
    .update(`${url}#${kind}#v2`)
    .digest("hex");
  return `/uploads/${hash}.png`;
}

/** @internal exposed so the extension policy stays testable. */
export function sourceExtension(url: string): string {
  return extensionFor(url);
}

/** BT.601 luma, the weighting the publisher's canvas uses. */
export function lumaOf(r: number, g: number, b: number): number {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

/**
 * A normal map's coverage: decode each channel to `-1..1`, sum, clamp at zero.
 *
 * Red and green sit pinned near 127/128 on these files, so they contribute
 * roughly nothing and blue decides — but the decode is what makes the midpoint
 * mean *no coverage* instead of half of it.
 */
export function normalMapCoverage(r: number, g: number, b: number): number {
  const x = (r / 255) * 2 - 1;
  const y = (g / 255) * 2 - 1;
  const z = (b / 255) * 2 - 1;
  return Math.max(0, x + y + z) * 255;
}

/**
 * Bake coverage into alpha, and keep the RGB the Unity shaders sample.
 *
 * - Foil: greyscale luma in RGB + alpha — CSS and Unity agree.
 * - Varnish: original normal-map RGB + coverage alpha — CSS uses alpha, Unity
 *   decodes the normals from `.xyz`.
 */
export async function bakeMask(input: Buffer, kind: MaskKind): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.allocUnsafe(info.width * info.height * 4);

  for (let index = 0; index < info.width * info.height; index += 1) {
    const at = index * info.channels;
    const r = data[at];
    const g = data[at + 1];
    const b = data[at + 2];
    const dest = index * 4;

    if (kind === "foil") {
      const coverage = Math.round(
        Math.min(255, Math.max(0, lumaOf(r, g, b))),
      );
      out[dest] = coverage;
      out[dest + 1] = coverage;
      out[dest + 2] = coverage;
      out[dest + 3] = coverage;
    } else {
      out[dest] = r;
      out[dest + 1] = g;
      out[dest + 2] = b;
      out[dest + 3] = Math.round(
        Math.min(255, Math.max(0, normalMapCoverage(r, g, b))),
      );
    }
  }

  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

/**
 * The local copy of a mask, downloading and baking it if this is the first time.
 *
 * Returns `null` rather than throwing: a mask that cannot be fetched leaves the
 * card plain, which is the honest fallback — an unmasked layer would cover the
 * whole card.
 */
export async function localizeMaskImage(
  url: string,
  options: { kind: MaskKind; signal?: AbortSignal },
): Promise<string | null> {
  if (!url.startsWith("http")) {
    return url.startsWith("/uploads/") ? url : null;
  }

  const relativePath = maskUploadPath(url, options.kind);
  const targetDir = path.join(process.cwd(), "public", "uploads");
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
