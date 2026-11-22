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
 * Opaque mass centre + min-edge diameter (avoids soft horizontal fluff on
 * BC7 `{Color}_0N_cost*` layout atlases that inflate bbox width).
 */
export function opaqueDiscLayout(
  rgba: Buffer,
  width: number,
  height: number,
  alphaThreshold = 40,
): { cx: number; cy: number; diam: number } | null {
  let sx = 0;
  let sy = 0;
  let w = 0;
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = rgba[(y * width + x) * 4 + 3] ?? 0;
      if (a < alphaThreshold) continue;
      sx += x * a;
      sy += y * a;
      w += a;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (w === 0) return null;
  return {
    cx: sx / w,
    cy: sy / w,
    diam: Math.min(maxX - minX + 1, maxY - minY + 1),
  };
}

/**
 * Place `BattleCard_*` CostNumber (Bandai-flat digit) onto a card-sized plate
 * using the BC7 `{Color}_0N_cost*` atlas only for on-card centre / diameter.
 *
 * Diameter uses **height** scale (`cardH/layoutH`), not `min(scaleX,scaleY)`.
 * The layout atlas is square and UV-mapped full-bleed; Bandai print matches
 * the gem as a fraction of card height (~74/1024 → ~60 px on 600×838). Using
 * `min` on print-widen (733×1024) shrank the badge to ~53 px.
 */
export async function bakeCostNumberBadge(
  spriteRgba: Buffer,
  spriteW: number,
  spriteH: number,
  layoutRgba: Buffer,
  layoutW: number,
  layoutH: number,
  cardW: number,
  cardH: number,
  supersample = PASTE_SPRITE_SUPERSAMPLE,
): Promise<Buffer> {
  const layout = opaqueDiscLayout(layoutRgba, layoutW, layoutH);
  const trimmed =
    trimOpaqueRgba(spriteRgba, spriteW, spriteH) ?? {
      rgba: spriteRgba,
      width: spriteW,
      height: spriteH,
    };
  const scaleX = cardW / layoutW;
  const scaleY = cardH / layoutH;
  const cx = layout ? layout.cx * scaleX : cardW * 0.12;
  const cy = layout ? layout.cy * scaleY : cardH * 0.08;
  const diam = Math.max(
    8,
    Math.round((layout?.diam ?? trimmed.width) * scaleY),
  );
  const ss = Math.max(1, supersample);
  const bigW = cardW * ss;
  const bigH = cardH * ss;
  const draw = diam * ss;
  const spriteBig = await sharp(trimmed.rgba, {
    raw: { width: trimmed.width, height: trimmed.height, channels: 4 },
  })
    .resize(draw, draw, { fit: "contain", kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  // contain may letterbox — measure opaque mass of resized sprite
  let massX = (draw - 1) / 2;
  let massY = (draw - 1) / 2;
  let weight = 0;
  let msx = 0;
  let msy = 0;
  for (let y = 0; y < draw; y += 1) {
    for (let x = 0; x < draw; x += 1) {
      const a = spriteBig[(y * draw + x) * 4 + 3] ?? 0;
      if (a < 32) continue;
      msx += x * a;
      msy += y * a;
      weight += a;
    }
  }
  if (weight > 0) {
    massX = msx / weight;
    massY = msy / weight;
  }
  const centerX = cx * ss - massX + (draw - 1) / 2;
  const centerY = cy * ss - massY + (draw - 1) / 2;
  const blank = Buffer.alloc(bigW * bigH * 4, 0);
  const filled = compositeCostFill(
    blank,
    bigW,
    bigH,
    spriteBig,
    draw,
    draw,
    centerX,
    centerY,
  );
  return sharp(filled, { raw: { width: bigW, height: bigH, channels: 4 } })
    .resize(cardW, cardH, { kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer();
}

/**
 * Composite fill into the chrome ring at {@link PASTE_SPRITE_SUPERSAMPLE}×,
 * mass-centred on each hole, then lanczos back to atlas size.
 *
 * `Cost_02` / `Cost_03` pass several centres (figure-8 / triple). Default is
 * `geom.center` alone (Cost_01).
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
  holeCenters?: readonly { x: number; y: number }[],
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
  const centers =
    holeCenters && holeCenters.length > 0 ? holeCenters : [geom.center];
  let filledBig: Buffer = ringBig;
  for (const hole of centers) {
    const centerX = hole.x * ss - massX + (fillDraw - 1) / 2;
    const centerY = hole.y * ss - massY + (fillDraw - 1) / 2;
    filledBig = compositeCostFill(
      filledBig,
      bigW,
      bigH,
      fillBig,
      fillDraw,
      fillDraw,
      centerX,
      centerY,
    );
  }
  return sharp(filledBig, {
    raw: { width: bigW, height: bigH, channels: 4 },
  })
    .resize(ringWidth, ringHeight, { kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer();
}
