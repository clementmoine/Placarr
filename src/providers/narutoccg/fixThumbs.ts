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
 *   pnpm naruto:cards -- --only thumbs
 *   pnpm naruto:cards -- --only thumbs --dry-run
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "./indexStore";
import { pickPreferredFaceArtFilename } from "./parseCarddassAsset";

/** A thumb may drift this far from its face before we call it distorted. */
export const THUMB_RATIO_TOLERANCE = 0.02;

export type ThumbCheck = {
  cardId: string;
  set: string;
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

  const dirsIn = (dir: string): string[] => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((name) => {
      try {
        return statSync(path.join(dir, name)).isDirectory();
      } catch {
        return false;
      }
    });
  };

  const out: ThumbCheck[] = [];
  for (const set of dirsIn(root)) {
    const setDir = path.join(root, set);
    for (const lang of dirsIn(setDir)) {
      const langDir = path.join(setDir, lang);
      for (const cardId of dirsIn(langDir)) {
        const cardDir = path.join(langDir, cardId);
        let files: string[];
        try {
          files = readdirSync(cardDir);
        } catch {
          continue;
        }
        const thumb = files.find((f) =>
          /^thumb\.(jpe?g|png|webp|gif)$/i.test(f),
        );
        const face = pickPreferredFaceArtFilename(files);
        if (!thumb || !face) continue;

        const t = await sharp(path.join(cardDir, thumb)).metadata();
        const f = await sharp(path.join(cardDir, face)).metadata();
        const tw = t.width ?? 0;
        const th = t.height ?? 0;
        const fw = f.width ?? 0;
        const fh = f.height ?? 0;
        if (!tw || !th || !fw || !fh) continue;

        const deviation = thumbRatioDeviation(tw, th, fw, fh);
        out.push({
          cardId,
          set,
          thumb: { width: tw, height: th, ratio: tw / th },
          face: { width: fw, height: fh, ratio: fw / fh },
          deviation,
          distorted: deviation > THUMB_RATIO_TOLERANCE,
        });
      }
    }
  }
  return out;
}

export async function runNarutoFixThumbsCli(opts?: {
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
    const dir = path.join(cardsDir(), c.set, "fr", c.cardId);
    const files = readdirSync(dir);
    const thumb = files.find((f) => /^thumb\.(jpe?g|png|webp|gif)$/i.test(f))!;
    const face = pickPreferredFaceArtFilename(files)!;

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
