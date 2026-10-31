/**
 * Identify views for live card ID when framing is loose.
 *
 * Prefers a detected card face. Full-frame fallbacks only when the frame
 * looks usable AND no card was detected (tight gallery crop). Empty / flat
 * frames abstain — never invent matches from a table.
 */
import sharp from "sharp";

import { assessIdentifyFrame } from "@/core/identify/cardFrameGate";
import { dewarpCardFace } from "@/core/identify/cardQuadDetect";
import { printGameFromPrintKey } from "@/core/identify/identifyConfidence";

export { printGameFromPrintKey };

/** Physical TCG face ratio (W/H). */
export const CARD_FACE_RATIO = 63 / 88;

export type CardViewRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Stable label for tests / debug. */
  id: string;
};

/**
 * Largest card-aspect rectangle that fits in the image, then scaled by
 * `cover` (1 = max inscribed) and shifted by `offsetX`/`offsetY` in [-1, 1]
 * across the remaining slack.
 */
export function cardAspectRect(
  imageWidth: number,
  imageHeight: number,
  opts?: {
    cover?: number;
    offsetX?: number;
    offsetY?: number;
    id?: string;
  },
): CardViewRect {
  const cover = Math.min(1, Math.max(0.2, opts?.cover ?? 1));
  const offsetX = Math.max(-1, Math.min(1, opts?.offsetX ?? 0));
  const offsetY = Math.max(-1, Math.min(1, opts?.offsetY ?? 0));

  const imgRatio = imageWidth / Math.max(1, imageHeight);
  let width: number;
  let height: number;
  if (imgRatio > CARD_FACE_RATIO) {
    height = imageHeight * cover;
    width = height * CARD_FACE_RATIO;
  } else {
    width = imageWidth * cover;
    height = width / CARD_FACE_RATIO;
  }
  width = Math.max(16, Math.min(imageWidth, Math.round(width)));
  height = Math.max(16, Math.min(imageHeight, Math.round(height)));

  const slackX = imageWidth - width;
  const slackY = imageHeight - height;
  const left = Math.round(
    Math.max(0, Math.min(slackX, slackX / 2 + (offsetX * slackX) / 2)),
  );
  const top = Math.round(
    Math.max(0, Math.min(slackY, slackY / 2 + (offsetY * slackY) / 2)),
  );

  return {
    left,
    top,
    width,
    height,
    id:
      opts?.id ??
      `cover${Math.round(cover * 100)}_x${Math.round(offsetX * 100)}`,
  };
}

/**
 * Fallback axis-aligned windows when quad detect abstains.
 * Kept small — dewarp is the main loose-framing path.
 */
export function planCardIdentifyRects(
  imageWidth: number,
  imageHeight: number,
): CardViewRect[] {
  if (imageWidth < 32 || imageHeight < 32) return [];

  const planned: CardViewRect[] = [
    {
      left: 0,
      top: 0,
      width: imageWidth,
      height: imageHeight,
      id: "full",
    },
    cardAspectRect(imageWidth, imageHeight, {
      cover: 1,
      id: "card_max",
    }),
    cardAspectRect(imageWidth, imageHeight, {
      cover: 0.62,
      id: "card_mid",
    }),
  ];

  const seen = new Set<string>();
  const unique: CardViewRect[] = [];
  for (const rect of planned) {
    const key = `${rect.left}:${rect.top}:${rect.width}:${rect.height}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(rect);
  }
  return unique;
}

async function extractRectJpeg(
  buffer: Buffer,
  rect: CardViewRect,
): Promise<Buffer | null> {
  try {
    return await sharp(buffer)
      .extract({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      })
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch {
    return null;
  }
}

export type CardIdentifyView = {
  id: string;
  buffer: Buffer;
};

export type BuildCardIdentifyViewsResult = {
  views: CardIdentifyView[];
  /** Why we abstained — empty views. */
  abstain?: "unreadable" | "no_card" | "too_dark" | "too_bright" | "too_flat";
  frame?: Awaited<ReturnType<typeof assessIdentifyFrame>>;
};

/**
 * Materialize JPEG views for identify.
 *
 * - Detected card → only that crop (never also match the surrounding table).
 * - No detection + usable frame → optional AABB fallbacks (gallery tight crop).
 * - Dark / flat frame → abstain (empty views).
 */
export async function buildCardIdentifyViews(
  buffer: Buffer,
  opts?: {
    limit?: number;
    /**
     * When false (default), skip full-frame fallbacks if no card was detected
     * — live camera pointing at a table must not invent hits.
     * Set true for gallery imports of already-cropped faces.
     */
    allowUndetectedFallbacks?: boolean;
  },
): Promise<BuildCardIdentifyViewsResult> {
  const limit = Math.max(1, opts?.limit ?? 4);
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(buffer).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    return { views: [], abstain: "unreadable" };
  }
  if (width < 32 || height < 32) {
    return { views: [], abstain: "unreadable" };
  }

  const frame = await assessIdentifyFrame(buffer);
  if (!frame.usable) {
    return {
      views: [],
      abstain: frame.reason ?? "too_flat",
      frame,
    };
  }

  const dewarped = await dewarpCardFace(buffer);
  if (dewarped) {
    // Re-check the crop itself — detector can latch onto a dark blob.
    const cropGate = await assessIdentifyFrame(dewarped.jpeg);
    if (!cropGate.usable) {
      return {
        views: [],
        abstain: cropGate.reason ?? "too_flat",
        frame: cropGate,
      };
    }
    return {
      views: [{ id: "dewarp", buffer: dewarped.jpeg }].slice(0, limit),
      frame,
    };
  }

  if (!opts?.allowUndetectedFallbacks) {
    // Live: quad miss on a textured, usable frame (common on flat table
    // shots — Maillet Lorcana) must not silent-miss. One card-aspect AABB
    // keeps us off empty tables (those fail assessIdentifyFrame above).
    const liveRect = cardAspectRect(width, height, {
      cover: 0.9,
      id: "card_live",
    });
    const liveJpeg = await extractRectJpeg(buffer, liveRect);
    if (liveJpeg) {
      const cropGate = await assessIdentifyFrame(liveJpeg);
      if (cropGate.usable) {
        return {
          views: [{ id: liveRect.id, buffer: liveJpeg }].slice(0, limit),
          frame,
        };
      }
    }
    return { views: [], abstain: "no_card", frame };
  }

  const views: CardIdentifyView[] = [];
  const rects = planCardIdentifyRects(width, height);
  for (const rect of rects) {
    if (views.length >= limit) break;
    if (
      rect.left === 0 &&
      rect.top === 0 &&
      rect.width === width &&
      rect.height === height
    ) {
      views.push({ id: rect.id, buffer });
      continue;
    }
    const cropped = await extractRectJpeg(buffer, rect);
    if (cropped) views.push({ id: rect.id, buffer: cropped });
  }
  if (!views.length) return { views: [], abstain: "no_card", frame };
  return { views: views.slice(0, limit), frame };
}

/** Merge match lists — keep lowest distance per printKey, then re-rank. */
export function mergeCardIdentifyMatches<
  T extends {
    printKey: string;
    distance: number;
    ambiguous?: boolean;
    votes?: number;
  },
>(
  lists: readonly (readonly T[])[],
  opts?: { limit?: number; minMargin?: number },
): T[] {
  const limit = opts?.limit ?? 8;
  const minMargin = opts?.minMargin ?? 0;
  const best = new Map<string, T>();
  for (const list of lists) {
    for (const row of list) {
      const prev = best.get(row.printKey);
      if (!prev || row.distance < prev.distance) {
        best.set(row.printKey, {
          ...row,
          ambiguous: undefined,
          votes: Math.max(prev?.votes ?? 0, row.votes ?? 0) || row.votes,
        });
      } else if (row.distance === prev.distance) {
        best.set(row.printKey, {
          ...prev,
          votes: Math.max(prev.votes ?? 0, row.votes ?? 0) || prev.votes,
        });
      } else if ((row.votes ?? 0) > (prev.votes ?? 0)) {
        best.set(row.printKey, {
          ...prev,
          votes: row.votes,
        });
      }
    }
  }
  const top = [...best.values()]
    .sort(
      (a, b) => a.distance - b.distance || a.printKey.localeCompare(b.printKey),
    )
    .slice(0, limit);
  if (
    minMargin > 0 &&
    top.length >= 2 &&
    top[1]!.distance - top[0]!.distance < minMargin
  ) {
    return top.map((row) => ({ ...row, ambiguous: true }));
  }
  return top;
}

/**
 * CLIP is soft on small/loose crops; art-band dHash on a detected card
 * window often stays sharp. Prefer a clear dHash hit when CLIP is weak.
 * When both are sharp but disagree → merge as doubt candidates.
 *
 * Soft CLIP alone (no dHash) must not become a shortlist: only Lorcana has
 * embeddings today, so a DBS/foil live frame otherwise paints Lorcana FPs.
 */
export function pickHybridIdentifyMatches<
  T extends { printKey: string; distance: number; ambiguous?: boolean },
>(
  embed: readonly T[] | null | undefined,
  dhash: readonly T[] | null | undefined,
  opts?: {
    /** CLIP distance above this is "soft" (milli-dissimilarity). */
    embedSoftDistance?: number;
    /** dHash Hamming at or below this is "sharp". */
    dhashSharpDistance?: number;
  },
): { matches: T[]; method: "embed" | "dhash" | "hybrid" } {
  // Phone live frames often land ~150–280 milli-cosine; 90 was so tight that
  // every real photo looked "soft" and lost to cross-game dHash noise.
  // 200 still silent-missed clear Lorcana (Jafar 2-184) on slightly soft crops.
  const embedSoft = opts?.embedSoftDistance ?? 280;
  const dhashSharp = opts?.dhashSharpDistance ?? 8;
  const embedList = embed?.length ? [...embed] : null;
  const dhashList = dhash?.length ? [...dhash] : null;

  if (!embedList) {
    return { matches: dhashList ?? [], method: "dhash" };
  }
  if (!dhashList) {
    const best = embedList[0]!;
    const clear = best.distance <= embedSoft && !best.ambiguous;
    // Soft embed-only → honest miss (cross-game nearest neighbors).
    return clear
      ? { matches: embedList, method: "embed" }
      : { matches: [], method: "embed" };
  }

  const embedBest = embedList[0]!;
  const dhashBest = dhashList[0]!;
  const dhashClear = dhashBest.distance <= dhashSharp && !dhashBest.ambiguous;
  const embedClear = embedBest.distance <= embedSoft && !embedBest.ambiguous;
  const embedIsSoft = !embedClear;
  const agree = embedBest.printKey === dhashBest.printKey;

  // Soft CLIP + sharp dHash that *agree* → trust dHash (small live crops).
  if (dhashClear && embedIsSoft && agree) {
    return { matches: dhashList, method: "dhash" };
  }

  // Disagree with at least one clear signal.
  // Soft-vs-soft disagree is NOT enough — that was DBS→Lorcana FP carousels.
  // Cross-game disagree → honest miss (never "Vegeta ou Broly ?" for a Naruto).
  // Same-game disagree → hybrid doubt carousel.
  if (!agree && (dhashClear || embedClear)) {
    const embedGame = printGameFromPrintKey(embedBest.printKey);
    const dhashGame = printGameFromPrintKey(dhashBest.printKey);
    if (embedGame && dhashGame && embedGame !== dhashGame) {
      return { matches: [], method: "hybrid" };
    }
    return {
      matches: mergeCardIdentifyMatches([embedList, dhashList], {
        limit: 8,
        minMargin: 0,
      }).map((row) => ({ ...row, ambiguous: true })),
      method: "hybrid",
    };
  }

  if (embedClear) {
    return { matches: embedList, method: "embed" };
  }

  // Soft CLIP + non-sharp dHash: keep only when they agree.
  if (agree) {
    return { matches: dhashList, method: "dhash" };
  }

  return { matches: [], method: "embed" };
}

export {
  IDENTIFY_DOUBT_MAX,
  IDENTIFY_DOUBT_RADIUS_DHASH,
  IDENTIFY_DOUBT_RADIUS_EMBED,
  IDENTIFY_EMBED_SHORTLIST_MAX,
  IDENTIFY_SURE_DHASH,
  IDENTIFY_SURE_EMBED,
  IDENTIFY_SURE_EMBED_OCR,
  IDENTIFY_SURE_MARGIN_DHASH,
  IDENTIFY_SURE_MARGIN_EMBED,
  finalizeIdentifyConfidence,
  sameGameOrAbstain,
  trimDoubtShortlist,
  type IdentifyConfidence,
} from "@/core/identify/identifyConfidence";
