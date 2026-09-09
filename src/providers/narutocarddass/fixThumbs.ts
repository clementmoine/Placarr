/**
 * Detect and repair distorted card thumbnails.
 *
 * A thumbnail is a scaled copy of its card's face, so it must carry the same
 * aspect ratio as that face. Some early thumbs were resized without keeping
 * the ratio — `s2/fr/ta091/thumb.jpg` is 400x458 (0.873) while its own
 * `art.jpg` is 350x495 (0.707), a card squashed 24% flat.
 *
 * The reference is the card's own face, not a corpus average: sets legitimately
 * differ (350x495 in S1–S4, 843x1206 in S5), so only the per-card comparison is
 * meaningful.
 *
 *   Catalogue Sync --only thumbs
 *   Catalogue Sync --only thumbs --dry-run
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "./indexStore";
import { listNarutoCardDirs } from "./narutoCardDisk";
import { pickPreferredFaceArtFilename } from "./parse/parseCarddassAsset";

/** A thumb may drift this far from its face before we call it distorted. */
export const THUMB_RATIO_TOLERANCE = 0.02;

export type ThumbCheck = {
  cardId: string;
  set: string;
  dir: string;
  lang: string;
  thumb: { width: number; height: number; ratio: number };
  face: { width: number; height: number; ratio: number };
  deviation: number;
  distorted: boolean;
};

/** Relative gap between a thumb ratio and its face ratio. */
export function thumbRatioDeviation(
  thumbW: number,
  thumbH: number,
  faceW: number,
  faceH: number,
): number {
  if (!thumbH || !faceH || !faceW) return 0;
  const face = faceW / faceH;
  return Math.abs(thumbW / thumbH - face) / face;
}

/** Height is kept so the thumb stays in the same size family; width follows. */
export function correctedThumbSize(
  thumbH: number,
  faceW: number,
  faceH: number,
): { width: number; height: number } {
  return { width: Math.round(thumbH * (faceW / faceH)), height: thumbH };
}

function cardsDir(): string {
  return path.join(dataRoot(), NARUTO_PACK_ID, "cards");
}

export async function checkNarutoThumbs(): Promise<ThumbCheck[]> {
  const root = cardsDir();
  if (!existsSync(root)) return [];

  const out: ThumbCheck[] = [];
  for (const hit of listNarutoCardDirs(root)) {
    let files: string[];
    try {
      files = readdirSync(hit.abs);
    } catch {
      continue;
    }
    const thumb = files.find((f) => /^thumb\.(jpe?g|png|webp|gif)$/i.test(f));
    const face = pickPreferredFaceArtFilename(files, hit.lang);
    if (!thumb || !face) continue;

    const t = await sharp(path.join(hit.abs, thumb)).metadata();
    const f = await sharp(path.join(hit.abs, face)).metadata();
    const tw = t.width ?? 0;
    const th = t.height ?? 0;
    const fw = f.width ?? 0;
    const fh = f.height ?? 0;
    if (!tw || !th || !fw || !fh) continue;

    const deviation = thumbRatioDeviation(tw, th, fw, fh);
    out.push({
      cardId: hit.diskId,
      set: hit.appearanceSet ?? hit.family,
      dir: hit.abs,
      lang: hit.lang,
      thumb: { width: tw, height: th, ratio: tw / th },
      face: { width: fw, height: fh, ratio: fw / fh },
      deviation,
      distorted: deviation > THUMB_RATIO_TOLERANCE,
    });
  }
  return out;
}

export async function runNarutoFixThumbs(opts?: {
  dryRun?: boolean;
}): Promise<void> {
  console.log(`── Naruto thumbs${opts?.dryRun ? " (dry run)" : ""}`);
  const checks = await checkNarutoThumbs();
  const bad = checks
    .filter((c) => c.distorted)
    .sort((a, b) => b.deviation - a.deviation);

  console.log(`   ${checks.length} vignettes, ${bad.length} déformées`);
  for (const c of bad) {
    const size = correctedThumbSize(
      c.thumb.height,
      c.face.width,
      c.face.height,
    );
    const dir = c.dir;
    const files = readdirSync(dir);
    const thumb = files.find((f) => /^thumb\.(jpe?g|png|webp|gif)$/i.test(f))!;
    const face = pickPreferredFaceArtFilename(files, c.lang)!;

    console.log(
      `   ${c.set}/${c.cardId.padEnd(10)} ${c.thumb.width}x${c.thumb.height}` +
        ` (${(c.deviation * 100).toFixed(1)}% d'écart) → ${size.width}x${size.height}`,
    );
    if (opts?.dryRun) continue;

    // Re-derive from the face rather than un-stretching the thumb: the face
    // holds the undistorted pixels.
    const buf = await sharp(path.join(dir, face))
      .resize(size.width, size.height, { fit: "fill" })
      .jpeg({ quality: 90 })
      .toBuffer();
    await sharp(buf).toFile(path.join(dir, thumb));
  }
  if (!bad.length) console.log("   rien à corriger");
}
