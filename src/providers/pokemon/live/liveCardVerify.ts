/**
 * Compare a Live screenshot (card open) against the dumped cardTex for a bundle.
 * Returns a 0–1 similarity (1 = identical). Fail soft if texture missing.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { dataRoot } from "@/lib/runtimeData";

export function cardTexPath(bundle: string): string {
  return path.join(
    dataRoot(),
    "pokemon",
    "foil",
    "textures",
    bundle,
    `${bundle}.webp`,
  );
}

/**
 * Crop the central card portrait from a 1080×1920-style Card-Dex detail shot.
 * Ratios measured on the open-card view (card dominates the middle of the frame).
 */
function cardCrop(w: number, h: number) {
  const left = Math.round(w * 0.12);
  const top = Math.round(h * 0.14);
  const width = Math.round(w * 0.76);
  const height = Math.round(h * 0.58);
  return { left, top, width, height };
}

export async function verifyAgainstCardTex(
  screenshotPng: Buffer,
  bundle: string,
): Promise<{ ok: boolean; score: number; tex: string; detail: string }> {
  const tex = cardTexPath(bundle);
  if (!existsSync(tex)) {
    return {
      ok: false,
      score: 0,
      tex,
      detail: "cardTex missing on disk",
    };
  }

  const shot = sharp(screenshotPng);
  const meta = await shot.metadata();
  const w = meta.width ?? 1080;
  const h = meta.height ?? 1920;
  const crop = cardCrop(w, h);

  const SIZE = 64;
  const [a, b] = await Promise.all([
    shot
      .clone()
      .extract(crop)
      .resize(SIZE, SIZE, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer(),
    sharp(tex)
      .resize(SIZE, SIZE, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer(),
  ]);

  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    sum += Math.abs(a[i]! - b[i]!);
  }
  const score = 1 - sum / (n * 255);
  // Foil / tilt / UI chrome lower the score vs flat cardTex — threshold is loose
  // but still rejects a wrong card (different art).
  const ok = score >= 0.55;
  return {
    ok,
    score,
    tex,
    detail: ok
      ? `match ${(score * 100).toFixed(1)}% vs cardTex`
      : `mismatch ${(score * 100).toFixed(1)}% vs cardTex (want ≥ 55%)`,
  };
}
