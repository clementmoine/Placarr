import crypto from "crypto";
import fs from "fs";
import path from "path";

import sharp from "sharp";

/**
 * Bringing a foil mask onto disk, in the form the CSS can use directly.
 *
 * The masks used to be worn through an SVG `<mask>` element, referenced from CSS
 * as `mask-image: url(#id)`. That indirection existed for two reasons and needed
 * neither:
 *
 * 1. *"A CSS `mask-image` would read the JPEG's alpha, which is opaque."* True
 *    only by default — `mask-mode: luminance` is exactly the property that says
 *    to read brightness instead. The SVG was solving a problem CSS already had a
 *    keyword for.
 * 2. *The varnish masks are normal maps,* where only the blue channel carries
 *    coverage, so an `feColorMatrix` pulled blue into every channel. That is one
 *    channel extraction on a static file — it belongs at download, once, not in
 *    the compositor on every frame.
 *
 * Removing the indirection matters because Safari does not apply an SVG `<mask>`
 * referenced from CSS to an HTML element. Every layer covered the whole card on
 * iPhone: artwork, text box, borders. A plain image mask is a path every engine
 * has supported for years.
 */

/** Extensions we are willing to write, keyed off the source URL. */
const MASK_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function extensionFor(url: string): string {
  const guess = path.extname(new URL(url).pathname).toLowerCase();
  return MASK_EXTENSIONS.has(guess) ? guess : ".jpg";
}

/**
 * Where a mask lands. The kind is part of the hash: the same normal map serves
 * as both a raw file and a baked coverage mask, and they must not collide.
 */
export function maskUploadPath(url: string, coverage: boolean): string {
  const hash = crypto
    .createHash("md5")
    .update(coverage ? `${url}#coverage` : url)
    .digest("hex");
  // A baked mask is always PNG: the bake is greyscale, and re-encoding it as
  // JPEG would band the very gradient the coverage depends on.
  return `/uploads/${hash}${coverage ? ".png" : extensionFor(url)}`;
}

/**
 * Pull the blue channel into a greyscale image.
 *
 * The publisher's varnish masks are normal maps: red and green sit pinned near
 * 127/128 and only blue says where anything is stamped. Read as luminance
 * as-is, a normal map is a flat mid-grey — the coat would cover the whole card
 * at half strength. This is the `feColorMatrix` that used to run per frame,
 * done once.
 */
export async function bakeCoverageMask(input: Buffer): Promise<Buffer> {
  // No `toColourspace("b-w")`: libvips applies the conversion before the
  // extraction, leaving a single-band image that `extractChannel` then cannot
  // take a third channel from — "Cannot extract channel 2 from image with
  // channels 0-0". Extraction already yields exactly one greyscale band.
  return sharp(input).extractChannel("blue").png().toBuffer();
}

/**
 * The local copy of a mask, downloading and baking it if this is the first time.
 *
 * Returns `null` rather than throwing: a mask that cannot be fetched leaves the
 * caller free to keep pointing at the publisher, which is better than no mask
 * at all — no mask means the layer covers the entire card.
 */
export async function localizeMaskImage(
  url: string,
  options: { coverage?: boolean; signal?: AbortSignal } = {},
): Promise<string | null> {
  if (!url.startsWith("http")) {
    return url.startsWith("/uploads/") ? url : null;
  }

  const coverage = options.coverage === true;
  const relativePath = maskUploadPath(url, coverage);
  const targetDir = path.join(process.cwd(), "public", "uploads");
  const targetPath = path.join(targetDir, path.basename(relativePath));

  if (fs.existsSync(targetPath)) return relativePath;

  try {
    const response = await fetch(url, { signal: options.signal });
    if (!response.ok) return null;
    const downloaded = Buffer.from(await response.arrayBuffer());
    const bytes = coverage ? await bakeCoverageMask(downloaded) : downloaded;

    await fs.promises.mkdir(targetDir, { recursive: true });
    await fs.promises.writeFile(targetPath, bytes);
    return relativePath;
  } catch {
    return null;
  }
}
