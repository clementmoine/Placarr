/**
 * Supersampled Cost_01 + CostFrame_{Color} bake for catalogue flatten.
 */

import sharp from "sharp";

import {
  COST_FILL_DRAW_SIZE,
  PASTE_SPRITE_SUPERSAMPLE,
} from "./clientFacePolicy";
import { compositeCostFill } from "./clientFaces";
import type { CostRingGeometry } from "./costRingGeometry";

/** Crop to opaque bbox so atlas padding does not shrink the disc on resize. */
export function trimOpaqueRgba(
  rgba: Buffer,
  width: number,
  height: number,
  alphaThreshold = 40,
): { rgba: Buffer; width: number; height: number } | null {
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let n = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = rgba[(y * width + x) * 4 + 3] ?? 0;
      if (a < alphaThreshold) continue;
      n += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (n === 0) return null;
  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;
  if (tw === width && th === height && minX === 0 && minY === 0) {
    return { rgba, width, height };
  }
  const out = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y += 1) {
    const src = ((minY + y) * width + minX) * 4;
    out.set(rgba.subarray(src, src + tw * 4), y * tw * 4);
  }
  return { rgba: out, width: tw, height: th };
}

/**
 * Composite fill into the chrome ring at {@link PASTE_SPRITE_SUPERSAMPLE}×,
 * mass-centred on the hole, then lanczos back to atlas size.
 *
 * Source should be `CostFrame_*` (RGBA32). Trim opaque first so a 226² atlas
 * with an ~89 px disc does not collapse under transparent padding.
 */
export async function bakeCostRingFill(
  ringRgba: Buffer,
  ringWidth: number,
  ringHeight: number,
  fillRgba: Buffer,
  fillWidth: number,
  fillHeight: number,
  geom: CostRingGeometry,
  drawSize = COST_FILL_DRAW_SIZE,
  supersample = PASTE_SPRITE_SUPERSAMPLE,
): Promise<Buffer> {
  const ss = Math.max(1, supersample);
  const bigW = ringWidth * ss;
  const bigH = ringHeight * ss;
  const fillDraw = drawSize * ss;
  const trimmed =
    trimOpaqueRgba(fillRgba, fillWidth, fillHeight) ?? {
      rgba: fillRgba,
      width: fillWidth,
      height: fillHeight,
    };

  const ringBig = await sharp(ringRgba, {
    raw: { width: ringWidth, height: ringHeight, channels: 4 },
  })
    .resize(bigW, bigH, { kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const fillBig = await sharp(trimmed.rgba, {
    raw: { width: trimmed.width, height: trimmed.height, channels: 4 },
  })
    .resize(fillDraw, fillDraw, { kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer();

  let massX = (fillDraw - 1) / 2;
  let massY = (fillDraw - 1) / 2;
  let weight = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < fillDraw; y += 1) {
    for (let x = 0; x < fillDraw; x += 1) {
      const a = fillBig[(y * fillDraw + x) * 4 + 3] ?? 0;
      if (a < 32) continue;
      sx += x * a;
      sy += y * a;
      weight += a;
    }
  }
  if (weight > 0) {
    massX = sx / weight;
    massY = sy / weight;
  }
  const centerX = geom.center.x * ss - massX + (fillDraw - 1) / 2;
  const centerY = geom.center.y * ss - massY + (fillDraw - 1) / 2;
  const filledBig = compositeCostFill(
    ringBig,
    bigW,
    bigH,
    fillBig,
    fillDraw,
    fillDraw,
    centerX,
    centerY,
  );
  return sharp(filledBig, {
    raw: { width: bigW, height: bigH, channels: 4 },
  })
    .resize(ringWidth, ringHeight, { kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer();
}
