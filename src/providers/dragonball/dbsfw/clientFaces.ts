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
  CLIENT_FACE_BAKE_ID,
  CLIENT_FACE_LAYOUT_ID,
  CLIENT_FACE_TONE_ID,
  FW_PRINT_ASPECT as POLICY_ASPECT,
} from "./clientFacePolicy";
import {
  DEFAULT_COST_RING_GEOMETRY,
  type CostRingGeometry,
} from "./costRingGeometry";
import { isFrostComposeOrderCurrent } from "./frostCardMaterial";
import {
  FROST_COST_DISC_1,
  frostCostDiscDiameter as frostDiscDiam,
  type FrostCostDisc,
} from "./frostCostDisc";

export {
  CLIENT_FACE_BAKE_ID,
  CLIENT_FACE_LAYOUT_ID,
  CLIENT_FACE_TONE_ID,
  COST_FILL_DRAW_SIZE,
  COST_RING_DISC_FEATHER,
  FROST_COST_FILL_SLOT,
  FW_PRINT_ASPECT,
} from "./clientFacePolicy";
export {
  DEFAULT_COST_RING_GEOMETRY,
  deriveCostRingGeometry,
  deriveCostRingHoleCenters,
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

const FRAME_COLORS = new Set(["blue", "red", "green", "yellow", "black"]);

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

function battleExtraCostDigit(
  cardType: string | null,
  color: string | null,
  cost: string | null,
): { Color: string; digit: string } | null {
  const type = cardType?.trim().toUpperCase();
  if (type !== "BATTLE" && type !== "EXTRA") return null;
  const normalized = color?.trim().toLowerCase() ?? "";
  if (!FRAME_COLORS.has(normalized)) return null;
  const digit = cost?.trim() ?? "";
  if (!/^\d$/.test(digit)) return null;
  return {
    Color: `${normalized[0]!.toUpperCase()}${normalized.slice(1)}`,
    digit,
  };
}

/**
 * CostNumber **pixels** for catalogue / Bandai match: `BattleCard_{Color}_01_cost{n}`
 * (RGBA32, flat white digit + soft shadow). The BC7 `{Color}_0N_cost{n}` atlas
 * carries a gold bevel that print does not use.
 */
export function clientCostNumberSpriteName(
  cardType: string | null,
  color: string | null,
  cost: string | null,
): string | null {
  const parts = battleExtraCostDigit(cardType, color, cost);
  if (!parts) return null;
  return `BattleCard_${parts.Color}_01_cost${parts.digit}`;
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
        ((fill[source] ?? 0) * alpha +
          ((out[dest] ?? 0) * destAlpha * inv) / 255) /
          outAlpha,
      );
      out[dest + 1] = Math.round(
        ((fill[source + 1] ?? 0) * alpha +
          ((out[dest + 1] ?? 0) * destAlpha * inv) / 255) /
          outAlpha,
      );
      out[dest + 2] = Math.round(
        ((fill[source + 2] ?? 0) * alpha +
          ((out[dest + 2] ?? 0) * destAlpha * inv) / 255) /
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

/**
 * Specified-cost pip count → `Cost_0N` / `{Color}_0N_cost*` slot (1–3).
 * Empty specified cost still uses the cost-1 chrome when a numeral is shown.
 */
export function specifiedCostPipCount(
  specifiedCost: string | null | undefined,
): number {
  const letters = (specifiedCost ?? "").replace(/[^A-Za-z]/g, "");
  if (letters.length <= 0) return 1;
  return Math.min(3, letters.length);
}

export function clientCostRingName(
  specifiedCost: string | null | undefined,
): string {
  const n = specifiedCostPipCount(specifiedCost);
  return `Cost_0${n}`;
}

/**
 * Full-card BC7 CostNumber **layout** atlas (`Yellow_02_cost5`). Used only for
 * on-card anchor / size — pixels come from {@link clientCostNumberSpriteName}.
 */
export function clientBattleFrameName(
  cardType: string | null,
  color: string | null,
  cost: string | null,
  specifiedCost: string | null = null,
): string | null {
  const parts = battleExtraCostDigit(cardType, color, cost);
  if (!parts) return null;
  const slot = String(specifiedCostPipCount(specifiedCost)).padStart(2, "0");
  return `${parts.Color}_${slot}_cost${parts.digit}`;
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
    add(
      starter
        ? `Card_ST_${face}_${color}_Frame`
        : `Card_${face}_${color}_Frame`,
    );
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
 * Per-card order: Material Card gates via `frostCatalogueComposeOrder`
 * (Front→Frame→Middle→text→costRing→badge).
 */
export const DBS_FW_CLIENT_LAYER_FILES: Record<
  FwFaceSide,
  {
    picture: string;
    /** Frost `_MiddleTex` when `_ShowMiddleTex` (character over frame). */
    middle: string;
    text: string;
    /** FrameTex array z=0 (under Middle). */
    frame: string;
    /** FrameTex array z=2 (footer chrome over Middle). */
    frameTop: string;
    costRing: string;
    badge: string;
    /** Raw Unity DXT5 mip0 — WebGL Front prefers this over the cured WebP. */
    pictureS3tc: string;
    middleS3tc: string;
    frameS3tc: string;
    /** FrameTex array z=2 mip0 — same S3TC+LINEAR path as frame/middle. */
    frameTopS3tc: string;
    textS3tc: string;
  }
> = {
  front: {
    picture: "layer.picture.webp",
    middle: "layer.middle.webp",
    text: "layer.text.webp",
    frame: "layer.frame.webp",
    frameTop: "layer.frameTop.webp",
    costRing: "layer.costRing.webp",
    badge: "layer.badge.webp",
    pictureS3tc: "layer.picture.dxt5",
    middleS3tc: "layer.middle.dxt5",
    frameS3tc: "layer.frame.dxt5",
    frameTopS3tc: "layer.frameTop.dxt5",
    textS3tc: "layer.text.dxt5",
  },
  back: {
    picture: "layer.back-picture.webp",
    middle: "layer.back-middle.webp",
    text: "layer.back-text.webp",
    frame: "layer.back-frame.webp",
    frameTop: "layer.back-frameTop.webp",
    costRing: "layer.back-costRing.webp",
    badge: "layer.back-badge.webp",
    pictureS3tc: "layer.back-picture.dxt5",
    middleS3tc: "layer.back-middle.dxt5",
    frameS3tc: "layer.back-frame.dxt5",
    frameTopS3tc: "layer.back-frameTop.dxt5",
    textS3tc: "layer.back-text.dxt5",
  },
};

/** Per-face S3TC dims/format for WebGL (`picture` required; frame/text archive). */
export const DBS_FW_LAYERS_S3TC_META = "layers.s3tc.json";

/**
 * Material-driven flatten recipe written beside the face. Presence marks the
 * post–Card-material extract; missing → re-run without `--force`.
 */
export const DBS_FW_LAYERS_COMPOSE_META = "layers.compose.json";

/**
 * True when on-disk basenames already match the Frost-like extract layout.
 * Stale `art.client.webp` alone (pre–costRing / badge / middle split) is not
 * current — re-run extract without `--force`. Costless faces never write
 * `costRing` / `badge`. Split Back+Front cards require `middle`. Picture DXT
 * + `layers.s3tc.json` required for WebGL Front S3TC. Extract also requires
 * `layers.compose.json` `bake` = {@link CLIENT_FACE_BAKE_ID} (CPU, décodeur
 * conforme + Lanczos) — tout autre bake est périmé.
 */
export function isClientFaceExtractCurrent(
  basenames: ReadonlySet<string>,
  side: FwFaceSide,
  expectsCostRing: boolean,
  expectsMiddle = false,
  composeOrder?: readonly string[] | null,
  /** When provided (extract path), front faces must carry {@link CLIENT_FACE_BAKE_ID}. */
  bake?: string | null,
  /** When provided, must match {@link CLIENT_FACE_LAYOUT_ID} (print-widen). */
  layout?: string | null,
  /** When provided, must match {@link CLIENT_FACE_TONE_ID} (srgb-linear). */
  tone?: string | null,
): boolean {
  const face = DBS_FW_CLIENT_FACE_FILES[side];
  const layers = DBS_FW_CLIENT_LAYER_FILES[side];
  if (!basenames.has(face)) return false;
  if (!basenames.has(layers.picture) || !basenames.has(layers.text)) {
    return false;
  }
  if (expectsMiddle && !basenames.has(layers.middle)) return false;
  if (expectsCostRing && !basenames.has(layers.costRing)) return false;
  if (expectsCostRing && !basenames.has(layers.badge)) return false;
  // Footer chrome must be raw S3TC too — CPU WebP frameTop = tramage seam.
  if (basenames.has(layers.frameTop) && !basenames.has(layers.frameTopS3tc)) {
    return false;
  }
  if (side === "front") {
    if (!basenames.has(layers.pictureS3tc)) return false;
    if (!basenames.has(DBS_FW_LAYERS_S3TC_META)) return false;
    if (!basenames.has(DBS_FW_LAYERS_COMPOSE_META)) return false;
    // Reject pre–UI-on-top stacks (costRing under Middle / text).
    if (
      composeOrder !== undefined &&
      !isFrostComposeOrderCurrent(composeOrder)
    ) {
      return false;
    }
    // Seul le bake CPU conforme (bcn + Lanczos) est produit ; les anciens
    // "gpu" (WebGL) et "cpu" (décodeur tramé) sont rebakés.
    if (bake !== undefined && bake !== CLIENT_FACE_BAKE_ID) return false;
    // Reject pre–widen shrink layout (512×715).
    if (layout !== undefined && layout !== CLIENT_FACE_LAYOUT_ID) return false;
    // Reject pre–display-bytes bake (DXT sRGB + raw RGBA costRing/badge mix).
    if (tone !== undefined && tone !== CLIENT_FACE_TONE_ID) return false;
  }
  return true;
}

/**
 * Fit a client texture onto the printed 63×88 card.
 * A 1:2 art (512×1024) widens → 733×1024. Already wide enough faces stay put.
 * GPU S3TC+LINEAR bake samples native mip0 onto this size.
 */
export function clientFacePixels(
  width: number,
  height: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width, height };
  const aspect = POLICY_ASPECT;
  const wideEnough = Math.round(height * aspect);
  if (width >= wideEnough) return { width, height };
  return { width: wideEnough, height };
}
