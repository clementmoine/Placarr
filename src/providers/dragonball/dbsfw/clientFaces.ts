/**
 * Fusion World client textures that make a card face.
 *
 * The client does not store a flattened scan. A face is an illustration
 * (`*_Card`, `*_Front`, `*_Front_Card`) plus the language plate
 * (`*_Text_En` / `*_Text_Ja`). A double-faced print repeats that pair
 * as `*_Back_Card` + `*_Back_Text_*`.
 *
 * A bare `*_Back` is a holo wash or a second illustration, not the verso.
 * Masks, foils and thumbnails are not faces.
 */

import {
  COST_RING_DISC_FEATHER as POLICY_FEATHER,
  FW_PRINT_ASPECT as POLICY_ASPECT,
} from "./clientFacePolicy";
import {
  DEFAULT_COST_RING_GEOMETRY,
  type CostRingGeometry,
} from "./costRingGeometry";
import {
  FROST_COST_DISC_1,
  frostCostDiscDiameter as frostDiscDiam,
  type FrostCostDisc,
} from "./frostCostDisc";

export {
  COST_FILL_DRAW_SIZE,
  COST_RING_DISC_FEATHER,
  FROST_COST_FILL_SLOT,
  FW_PRINT_ASPECT,
} from "./clientFacePolicy";
export {
  DEFAULT_COST_RING_GEOMETRY,
  deriveCostRingGeometry,
  type CostRingGeometry,
} from "./costRingGeometry";
export {
  FROST_COST_DISC_1,
  frostCostDiscDiameter,
  frostCostDiscForCost,
  parseFrostCostDiscTable,
  type FrostCostDisc,
} from "./frostCostDisc";

export type FwFaceSide = "front" | "back";

export type FwFaceLayer =
  | { kind: "picture"; side: FwFaceSide }
  | { kind: "text"; side: FwFaceSide; lang: "en" | "ja" };

/** Which layer a client texture is, or null when it is not part of a face. */
export function fusionWorldFaceLayer(name: string): FwFaceLayer | null {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;
  if (/holo|foil|ef_mask|thumb|alp/.test(normalized)) return null;

  const text = /_text_(en|ja)$/.exec(normalized);
  if (text) {
    return {
      kind: "text",
      side: /_back_text_/.test(normalized) ? "back" : "front",
      lang: text[1] === "ja" ? "ja" : "en",
    };
  }

  if (/_back_card$/.test(normalized)) return { kind: "picture", side: "back" };
  if (
    /_front_card$/.test(normalized) ||
    /_front$/.test(normalized) ||
    /_card$/.test(normalized)
  ) {
    return { kind: "picture", side: "front" };
  }
  return null;
}

/**
 * Fractional LOD of a plate drawn at `destWidth`. Catalogue 1024→512 is
 * a full mip step; the old 1024→733 widen was only ~0.48.
 */
export function clientPlateMipLod(
  sourceWidth: number,
  destWidth: number,
): number {
  if (destWidth >= sourceWidth || sourceWidth <= 0) return 0;
  return Math.max(0, Math.log2(sourceWidth / destWidth));
}

/**
 * Weight of the next mip when the plate is drawn at `destWidth`.
 * Kept for tests; prefer {@link boxFilterRgba} at the dest size.
 */
export function clientPlateMipBlend(
  sourceWidth: number,
  destWidth: number,
): number {
  const lod = clientPlateMipLod(sourceWidth, destWidth);
  if (lod <= 0) return 0;
  // Below ~¾ of native width the client is already on mip1+.
  if (destWidth <= sourceWidth * 0.75) return 1;
  return Math.min(1, lod * 2);
}

/** Mix two same-size RGBA buffers. `t = 1` keeps only `mip1`. */
export function blendPlateMips(
  mip0: Buffer,
  mip1: Buffer,
  t: number,
): Buffer {
  if (t <= 0) return mip0;
  if (t >= 1) return mip1;
  const out = Buffer.allocUnsafe(mip0.length);
  const keep = 1 - t;
  for (let i = 0; i < mip0.length; i += 1) {
    out[i] = Math.round((mip0[i] ?? 0) * keep + (mip1[i] ?? 0) * t);
  }
  return out;
}

/**
 * Prefer Unity mip1 where the plate shows a DXT stair: low-chroma chrome
 * with luma variance, or any silhouette with alpha variance (cost gem rim).
 * Flat saturated interiors stay on mip0. Both buffers same size.
 */
export function resolvePlateChromeMips(
  mip0: Buffer,
  mip1: Buffer,
  width: number,
  height: number,
): Buffer {
  if (mip0.length !== mip1.length) return mip0;
  const out = Buffer.from(mip0);
  const at = (buf: Buffer, x: number, y: number) => {
    const i = (y * width + x) * 4;
    return {
      L: Math.max(buf[i] ?? 0, buf[i + 1] ?? 0, buf[i + 2] ?? 0),
      a: buf[i + 3] ?? 0,
    };
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const a = mip0[i + 3] ?? 0;
      if (a < 8) continue;
      const r = mip0[i] ?? 0;
      const g = mip0[i + 1] ?? 0;
      const b = mip0[i + 2] ?? 0;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      let minL = 255;
      let maxL = 0;
      let minA = 255;
      let maxA = 0;
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(height - 1, y + 1);
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(width - 1, x + 1);
      for (let yy = y0; yy <= y1; yy += 1) {
        for (let xx = x0; xx <= x1; xx += 1) {
          const sample = at(mip0, xx, yy);
          if (sample.L < minL) minL = sample.L;
          if (sample.L > maxL) maxL = sample.L;
          if (sample.a < minA) minA = sample.a;
          if (sample.a > maxA) maxA = sample.a;
        }
      }
      const lumaVar = maxL - minL;
      const alphaVar = maxA - minA;
      const chromeStair = chroma <= 40 && lumaVar >= 28;
      const silhouette = alphaVar >= 48;
      // Flat saturated fill (gem interior) — keep mip0.
      if (!chromeStair && !silhouette) continue;
      out[i] = mip1[i] ?? r;
      out[i + 1] = mip1[i + 1] ?? g;
      out[i + 2] = mip1[i + 2] ?? b;
      out[i + 3] = mip1[i + 3] ?? a;
    }
  }
  return out;
}

/**
 * Area-average resize (Unity's continuous box mip at an arbitrary size).
 * Premultiplied so chrome alpha edges anti-alias instead of stair.
 */
export function boxFilterRgba(
  src: Buffer,
  srcWidth: number,
  srcHeight: number,
  destWidth: number,
  destHeight: number,
): Buffer {
  if (srcWidth === destWidth && srcHeight === destHeight) return src;
  const out = Buffer.alloc(destWidth * destHeight * 4);
  for (let y = 0; y < destHeight; y += 1) {
    const y0 = (y * srcHeight) / destHeight;
    const y1 = ((y + 1) * srcHeight) / destHeight;
    for (let x = 0; x < destWidth; x += 1) {
      const x0 = (x * srcWidth) / destWidth;
      const x1 = ((x + 1) * srcWidth) / destWidth;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      const xStart = Math.floor(x0);
      const xEnd = Math.min(srcWidth, Math.ceil(x1));
      const yStart = Math.floor(y0);
      const yEnd = Math.min(srcHeight, Math.ceil(y1));
      for (let sy = yStart; sy < yEnd; sy += 1) {
        const yLo = Math.max(sy, y0);
        const yHi = Math.min(sy + 1, y1);
        const yW = yHi - yLo;
        if (yW <= 0) continue;
        for (let sx = xStart; sx < xEnd; sx += 1) {
          const xLo = Math.max(sx, x0);
          const xHi = Math.min(sx + 1, x1);
          const wt = (xHi - xLo) * yW;
          if (wt <= 0) continue;
          const i = (sy * srcWidth + sx) * 4;
          const pa = src[i + 3] ?? 0;
          r += (src[i] ?? 0) * pa * wt;
          g += (src[i + 1] ?? 0) * pa * wt;
          b += (src[i + 2] ?? 0) * pa * wt;
          a += pa * wt;
          area += wt;
        }
      }
      const o = (y * destWidth + x) * 4;
      if (a < 1e-6 || area < 1e-6) continue;
      out[o] = Math.round(r / a);
      out[o + 1] = Math.round(g / a);
      out[o + 2] = Math.round(b / a);
      out[o + 3] = Math.round(a / area);
    }
  }
  return out;
}

/**
 * DXT5 interpolates glyph ink toward the black endpoint of the block, so a
 * letter is a ramp of opaque grays. Downscaling that ramp dissolves the
 * stroke. A low-chroma gray with coverage takes the brightest nearby
 * low-chroma ink (the white of the letter) and keeps its own coverage.
 * A near-black texel in the same block is the other DXT endpoint: if it
 * sits on the ink it takes that ink too. A flat dark panel is farther
 * from the letter, and a coloured badge fails the chroma test, so both stay.
 * Chrome tramage is handled by blending Unity's mip1, not by filtering here.
 */
export function solidifyPlateInk(
  rgba: Buffer,
  width: number,
  height: number,
): Buffer {
  const out = Buffer.from(rgba);
  const radius = 6;
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const alpha = rgba[i + 3] ?? 0;
      if (alpha < 160) continue;
      const red = rgba[i] ?? 0;
      const green = rgba[i + 1] ?? 0;
      const blue = rgba[i + 2] ?? 0;
      const luma = Math.max(red, green, blue);
      const chroma = luma - Math.min(red, green, blue);
      const darkHole = luma < 48 && alpha >= 230;
      const grayHole = chroma <= 36 && luma >= 48 && luma < 230;
      if (!darkHole && !grayHole) continue;
      const reach = darkHole ? 2 : radius;
      let bestLuma = luma;
      let bestRed = red;
      let bestGreen = green;
      let bestBlue = blue;
      const x0 = Math.max(0, x - reach);
      const x1 = Math.min(width - 1, x + reach);
      const yStart = darkHole ? Math.max(0, y - reach) : y0;
      const yEnd = darkHole ? Math.min(height - 1, y + reach) : y1;
      for (let yy = yStart; yy <= yEnd; yy += 1) {
        let j = (yy * width + x0) * 4;
        for (let xx = x0; xx <= x1; xx += 1) {
          const alpha2 = rgba[j + 3] ?? 0;
          if (alpha2 >= 220) {
            const red2 = rgba[j] ?? 0;
            const green2 = rgba[j + 1] ?? 0;
            const blue2 = rgba[j + 2] ?? 0;
            const luma2 = Math.max(red2, green2, blue2);
            if (
              luma2 > bestLuma &&
              luma2 - Math.min(red2, green2, blue2) <= 24
            ) {
              bestLuma = luma2;
              bestRed = red2;
              bestGreen = green2;
              bestBlue = blue2;
            }
          }
          j += 4;
        }
      }
      const lift = bestLuma - luma;
      if (lift < (darkHole ? 160 : 24)) {
        // A black DXT endpoint on a silver rim is not white ink, so the
        // letter rule leaves it. It only counts when metal and empty
        // space both touch it — a dark panel has neither.
        if (!darkHole || bestLuma < 70 || bestLuma > 190 || lift < 48) continue;
        let metal = 0;
        let clear = 0;
        for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy += 1) {
          for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
            if (xx === x && yy === y) continue;
            const j = (yy * width + xx) * 4;
            const alpha2 = rgba[j + 3] ?? 0;
            if (alpha2 < 8) {
              clear += 1;
              continue;
            }
            if (alpha2 < 220) continue;
            const red2 = rgba[j] ?? 0;
            const green2 = rgba[j + 1] ?? 0;
            const blue2 = rgba[j + 2] ?? 0;
            const luma2 = Math.max(red2, green2, blue2);
            if (luma2 >= 70 && luma2 <= 190 && luma2 - Math.min(red2, green2, blue2) <= 24) {
              metal += 1;
            }
          }
        }
        if (metal < 1 || clear < 1) continue;
      }
      out[i] = bestRed;
      out[i + 1] = bestGreen;
      out[i + 2] = bestBlue;
    }
  }
  return out;
}

/**
 * Straight RGBA filtered as-is pulls the black of a transparent texel into
 * the stroke and draws a screen along the edge. Coverage has to weight the
 * colour before the resample, then come back off after.
 */
export function premultiplyStraight(rgba: Buffer): Buffer {
  const out = Buffer.from(rgba);
  for (let i = 0; i < out.length; i += 4) {
    const alpha = out[i + 3] ?? 0;
    if (alpha >= 255) continue;
    const scale = alpha / 255;
    out[i] = Math.round((out[i] ?? 0) * scale);
    out[i + 1] = Math.round((out[i + 1] ?? 0) * scale);
    out[i + 2] = Math.round((out[i + 2] ?? 0) * scale);
  }
  return out;
}

/** Inverse of {@link premultiplyStraight}. A trace of coverage stays black. */
export function unpremultiplyStraight(rgba: Buffer): Buffer {
  const out = Buffer.from(rgba);
  for (let i = 0; i < out.length; i += 4) {
    const alpha = out[i + 3] ?? 0;
    if (alpha >= 255) continue;
    if (alpha < 8) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      continue;
    }
    const scale = 255 / alpha;
    out[i] = Math.min(255, Math.round((out[i] ?? 0) * scale));
    out[i + 1] = Math.min(255, Math.round((out[i + 1] ?? 0) * scale));
    out[i + 2] = Math.min(255, Math.round((out[i + 2] ?? 0) * scale));
  }
  return out;
}

const FRAME_COLORS = new Set(["blue", "red", "green", "yellow", "black"]);

/**
 * Header and cost numeral for a battle or extra card.
 * `Blue_01_cost1` is the printed header (white numeral). Leaders and
 * energy markers have no cost, so they keep the plate they already carry.
 */

/**
 * Coloured disc that fills `Cost_01`.
 * Prefer `CostFrame_{Color}` (RGBA32, ~89 px) over `Cost_{Color}` (DXT5 32²)
 * — the DXT pip stair-steps even after supersample.
 */
export function clientCostFillName(color: string | null): string | null {
  const normalized = color?.trim().toLowerCase() ?? "";
  if (!FRAME_COLORS.has(normalized)) return null;
  const Color = `${normalized[0]!.toUpperCase()}${normalized.slice(1)}`;
  return `CostFrame_${Color}`;
}

/** @deprecated Prefer geometry.outerDiam from {@link deriveCostRingGeometry}. */
export const COST_RING_OUTER_DIAM = DEFAULT_COST_RING_GEOMETRY.outerDiam;

/** Centre of the blitted disc, in sprite pixels (fill / hole centre). */
export function clientCostRingAnchor(
  geom: CostRingGeometry = DEFAULT_COST_RING_GEOMETRY,
): { x: number; y: number } {
  const left = Math.floor(geom.center.x - (geom.fillSize - 1) / 2 + 1e-9);
  const top = Math.floor(geom.center.y - (geom.fillSize - 1) / 2 + 1e-9);
  return {
    x: left + (geom.fillSize - 1) / 2,
    y: top + (geom.fillSize - 1) / 2,
  };
}

/**
 * Place `Cost_01` so the Frost fill slot (`fillSize`, typically 32) matches
 * the cost-1 disc (`cardWidth/scaleX`). Chrome (outerDiam) scales with it
 * → ~27.5 px outer @ 512. Dividing by outerDiam (44) undersized the badge.
 */
export function clientCostRingOffset(
  cardWidth: number,
  cardHeight: number,
  geom: CostRingGeometry = DEFAULT_COST_RING_GEOMETRY,
  disc: FrostCostDisc = FROST_COST_DISC_1,
): { left: number; top: number; scale: number } {
  const anchor = clientCostRingAnchor(geom);
  const centerX = cardWidth * (0.5 - disc.offsetX);
  const centerY = cardHeight * (0.5 + disc.offsetY);
  const scale = frostDiscDiam(cardWidth, disc) / geom.fillSize;
  const applied = Math.round(geom.atlasSize * scale) / geom.atlasSize;
  return {
    left: Math.round(centerX - anchor.x * applied),
    top: Math.round(centerY - anchor.y * applied),
    scale,
  };
}

/**
 * Paint the coloured disc over the dark centre of the ring. The rim stays.
 * Callers should pass fill at {@link COST_FILL_DRAW_SIZE} (not native 32²).
 * Origin uses pixel-centre maths (`(size-1)/2`) so even sizes stay on the hole.
 */
export function compositeCostFill(
  ring: Buffer,
  ringWidth: number,
  ringHeight: number,
  fill: Buffer,
  fillWidth: number,
  fillHeight: number,
  centerX = DEFAULT_COST_RING_GEOMETRY.center.x,
  centerY = DEFAULT_COST_RING_GEOMETRY.center.y,
): Buffer {
  const out = Buffer.from(ring);
  // floor+(eps) keeps *.5 centres on-pixel for both odd and even fill sizes.
  const left = Math.floor(centerX - (fillWidth - 1) / 2 + 1e-9);
  const top = Math.floor(centerY - (fillHeight - 1) / 2 + 1e-9);
  for (let y = 0; y < fillHeight; y += 1) {
    const destY = top + y;
    if (destY < 0 || destY >= ringHeight) continue;
    for (let x = 0; x < fillWidth; x += 1) {
      const destX = left + x;
      if (destX < 0 || destX >= ringWidth) continue;
      const source = (y * fillWidth + x) * 4;
      const alpha = fill[source + 3] ?? 0;
      if (alpha < 8) continue;
      const dest = (destY * ringWidth + destX) * 4;
      if (alpha >= 250) {
        out[dest] = fill[source] ?? 0;
        out[dest + 1] = fill[source + 1] ?? 0;
        out[dest + 2] = fill[source + 2] ?? 0;
        out[dest + 3] = 255;
        continue;
      }
      const destAlpha = out[dest + 3] ?? 0;
      const inv = 255 - alpha;
      const outAlpha = alpha + Math.round((destAlpha * inv) / 255);
      if (outAlpha === 0) continue;
      out[dest] = Math.round(
        ((fill[source] ?? 0) * alpha + (out[dest] ?? 0) * destAlpha * inv / 255) /
          outAlpha,
      );
      out[dest + 1] = Math.round(
        ((fill[source + 1] ?? 0) * alpha +
          (out[dest + 1] ?? 0) * destAlpha * inv / 255) /
          outAlpha,
      );
      out[dest + 2] = Math.round(
        ((fill[source + 2] ?? 0) * alpha +
          (out[dest + 2] ?? 0) * destAlpha * inv / 255) /
          outAlpha,
      );
      out[dest + 3] = outAlpha;
    }
  }
  return out;
}

/**
 * `Cost_01` is a 220² atlas cell: the disc is ~50 px in one corner, the rest
 * clear. Soft alpha fluff outside the Frost disc can still blit as a stray
 * pip after scale. Keep coverage only near the painted centre.
 *
 * Feather the cut (smoothstep) — a hard `dist > r → α=0` baked stair-steps
 * into the silver ring once `pasteSprite` minifies to ~20–25 px on card.
 */
/** Half of outerDiam — isolate keeps the silver rim, not atlas fluff. */
export const COST_RING_DISC_RADIUS = DEFAULT_COST_RING_GEOMETRY.outerDiam / 2;

export function isolateCostRingDisc(
  rgba: Buffer,
  width: number,
  height: number,
  centerX = DEFAULT_COST_RING_GEOMETRY.outerCenter.x,
  centerY = DEFAULT_COST_RING_GEOMETRY.outerCenter.y,
  radius = COST_RING_DISC_RADIUS,
  feather = POLICY_FEATHER,
): Buffer {
  const out = Buffer.from(rgba);
  const outer = radius + feather;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x + 0.5 - centerX;
      const dy = y + 0.5 - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius - feather) continue;
      const i = (y * width + x) * 4;
      if (dist >= outer) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 0;
        continue;
      }
      // Smoothstep from full coverage at (radius - feather) to 0 at outer.
      const t = (outer - dist) / (2 * feather);
      const s = t * t * (3 - 2 * t);
      const a = Math.round((out[i + 3] ?? 0) * s);
      out[i] = Math.round(((out[i] ?? 0) * a) / 255);
      out[i + 1] = Math.round(((out[i + 1] ?? 0) * a) / 255);
      out[i + 2] = Math.round(((out[i + 2] ?? 0) * a) / 255);
      out[i + 3] = a;
    }
  }
  return out;
}

export const DBS_FW_COST_RING = "Cost_01";

export function clientBattleFrameName(
  cardType: string | null,
  color: string | null,
  cost: string | null,
): string | null {
  const type = cardType?.trim().toUpperCase();
  if (type !== "BATTLE" && type !== "EXTRA") return null;
  const normalized = color?.trim().toLowerCase() ?? "";
  if (!FRAME_COLORS.has(normalized)) return null;
  const digit = cost?.trim() ?? "";
  if (!/^\d$/.test(digit)) return null;
  return `${normalized[0]!.toUpperCase()}${normalized.slice(1)}_01_cost${digit}`;
}

export type FwFrameCard = {
  cardType: string | null;
  color: string | null;
  rarity: string | null;
  setCode: string;
  parallel: boolean;
  side: FwFaceSide;
};

function frameColorLabel(color: string | null): string | null {
  const normalized = color?.trim().toLowerCase() ?? "";
  if (!FRAME_COLORS.has(normalized)) return null;
  return `${normalized[0]!.toUpperCase()}${normalized.slice(1)}`;
}

/**
 * Texture-array names for the printed chrome, first match wins.
 * `Card_Battle_Blue_Frame` is the common booster battle frame.
 * Starters and story boosters have their own arrays. The cost digit
 * is a separate texture (`Blue_01_cost1`), not this frame.
 */
export function clientFrameArrayCandidates(card: FwFrameCard): string[] {
  const type = card.cardType?.trim().toUpperCase() ?? "";
  const set = card.setCode.trim().toLowerCase();
  const rarity = card.rarity?.trim().toUpperCase() ?? "";
  const starter = set.startsWith("st");
  const story = set.startsWith("sb");
  const names: string[] = [];
  const add = (name: string) => {
    if (!names.includes(name)) names.push(name);
  };
  if (type === "ENERGY MARKER") {
    add(starter ? "Energy_ST_Frame" : "Energy_Frame");
    return names;
  }
  const color = frameColorLabel(card.color);
  if (!color) return [];
  if (type === "LEADER") {
    const face = card.side === "back" ? "LeaderB" : "LeaderF";
    add(starter ? `Card_ST_${face}_${color}_Frame` : `Card_${face}_${color}_Frame`);
    return names;
  }
  if (type === "EXTRA") {
    add(starter ? `Card_ST_Extra_${color}_Frame` : `Card_Extra_${color}_Frame`);
    return names;
  }
  if (type !== "BATTLE") return [];
  if (starter) {
    if (rarity === "C") add(`Card_ST_BattleC_${color}_Frame`);
    if (rarity === "SCR") add(`Card_ST_BattleSCR_${color}_Frame`);
    add(`Card_ST_Battle_${color}_Frame`);
    return names;
  }
  if (story) {
    if (rarity === "SR") add(`Card_SB_BattleSR_${color}_Frame`);
    add(`Card_SB_BattleR_${color}_Frame`);
    return names;
  }
  if (rarity === "SR") add(`Card_BattleSR_${color}_Frame`);
  if (rarity === "SCR") add(`Card_BattleSCR_${color}_Frame`);
  if (card.parallel) add(`Card_Battle_PARA_${color}_Frame`);
  add(`Card_Battle_${color}_Frame`);
  return names;
}

export const DBS_FW_CLIENT_FACE_FILES = {
  front: "art.client.webp",
  back: "back.client.webp",
} as const;

/**
 * Foil / flatten layers beside the face. Names stay off `art.*` / `back.*`
 * so the catalogue does not rank them as a second face.
 * Order: picture → frame chrome → costRing → text → badge (Frost-like).
 */
export const DBS_FW_CLIENT_LAYER_FILES: Record<
  FwFaceSide,
  { picture: string; text: string; frame: string; costRing: string }
> = {
  front: {
    picture: "layer.picture.webp",
    text: "layer.text.webp",
    frame: "layer.frame.webp",
    costRing: "layer.costRing.webp",
  },
  back: {
    picture: "layer.back-picture.webp",
    text: "layer.back-text.webp",
    frame: "layer.back-frame.webp",
    costRing: "layer.back-costRing.webp",
  },
};

/**
 * Fit a client texture onto the printed 63×88 card without enlarging.
 * A 1:2 art (512×1024) keeps its width and shrinks height → 512×715.
 * Widening to 733×1024 magnified DXT; minifying the tall axis hides it.
 * Already wide enough faces stay put.
 */
export function clientFacePixels(
  width: number,
  height: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width, height };
  const aspect = POLICY_ASPECT;
  const wideEnough = Math.round(height * aspect);
  if (width >= wideEnough) return { width, height };
  return { width, height: Math.round(width / aspect) };
}
