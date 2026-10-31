/**
 * Sure / doubt / miss finalize for card identify — pure, client-safe.
 * Product rule: confident FP forbidden; honest doubt OK.
 */
import { parsePrintKey } from "@/core/identify/printKey";

/** Game slug from a printKey (`naruto:uc-0022` → `naruto`). */
export function printGameFromPrintKey(
  printKey: string | null | undefined,
): string | null {
  return parsePrintKey(printKey)?.game ?? null;
}

export type IdentifyConfidence = "sure" | "doubt" | "miss";

/*
 * Embed thresholds are milli-cosine distances in the DINOv2-small CLS space
 * (`embedMath.ts`), calibrated on the Lorcana FR pack — 3 462 arts, 150
 * phone-degraded queries (blur, JPEG, perspective, glare):
 *   correct #1      p50 178 · p90 301 · max 501
 *   nearest wrong   p10 177 · p50 283   (same game, reprinted art included)
 *   #1−#2 margin    p05  18 · p10  52 · p50 124  (reprints excluded)
 *   true errors     4/150 — wrong #1 at ≥279 with a lead ≤52
 * Sure = ≤230 AND margin ≥70 → zero confident FP on that set; everything
 * else is an honest doubt carousel (reprints) or a miss.
 */

/** Distance ceilings to promote a single "sure" hit (stricter than shortlist). */
export const IDENTIFY_SURE_DHASH = 4;
export const IDENTIFY_SURE_EMBED = 230;
/**
 * Soft embed shortlist ceiling (milli). Above this, embed-only hits are miss —
 * same threshold as pickHybridIdentifyMatches embedSoft default.
 */
export const IDENTIFY_EMBED_SHORTLIST_MAX = 380;
/** #2 must be at least this far behind #1 (same distance units). */
export const IDENTIFY_SURE_MARGIN_DHASH = 3;
export const IDENTIFY_SURE_MARGIN_EMBED = 70;

/**
 * Doubt carousel radius from #1 — drop far FP neighbors (e.g. Tenten next to
 * a clear Shikamaru) while keeping near reprints / twin arts.
 */
export const IDENTIFY_DOUBT_RADIUS_DHASH = 6;
export const IDENTIFY_DOUBT_RADIUS_EMBED = 110;
export const IDENTIFY_DOUBT_MAX = 5;

/** Keep only neighbors close enough to #1 for an honest doubt carousel. */
export function trimDoubtShortlist<
  T extends { printKey: string; distance: number },
>(matches: readonly T[], method: "embed" | "dhash" | "hybrid"): T[] {
  if (matches.length <= 1) return [...matches];
  const top = matches[0]!;
  const radius =
    method === "dhash"
      ? IDENTIFY_DOUBT_RADIUS_DHASH
      : IDENTIFY_DOUBT_RADIUS_EMBED;
  const near = matches.filter((row) => row.distance <= top.distance + radius);
  return near.slice(0, IDENTIFY_DOUBT_MAX);
}

/**
 * Drop other games from a shortlist. If a foreign game sits close to #1,
 * abstain entirely — cross-game "plusieurs possibilités" is worse than miss.
 */
export function sameGameOrAbstain<
  T extends { printKey: string; distance: number },
>(matches: readonly T[], opts?: { foreignMargin?: number }): T[] {
  if (!matches.length) return [];
  const topGame = printGameFromPrintKey(matches[0]!.printKey);
  if (!topGame) return [...matches];

  const foreignMargin = opts?.foreignMargin ?? IDENTIFY_SURE_MARGIN_EMBED;
  const foreign = matches.find((row) => {
    const game = printGameFromPrintKey(row.printKey);
    return Boolean(game && game !== topGame);
  });
  if (foreign) {
    const margin = foreign.distance - matches[0]!.distance;
    if (margin < foreignMargin) return [];
  }
  return matches.filter(
    (row) => printGameFromPrintKey(row.printKey) === topGame,
  );
}

/**
 * When OCR read set+number and it agrees with #1, the footer is the
 * disambiguator: reprinted art has ~0 embed margin by construction, so the
 * margin is waived and the distance ceiling loosened — still under the
 * shortlist max, so a far neighbor never becomes sure.
 */
export const IDENTIFY_SURE_EMBED_OCR = 360;

/**
 * Gate: only mark a hit "sure" when distance + margin are clear.
 * Sure → return that one card only. Doubt → trimmed shortlist, all ambiguous.
 * Miss → empty.
 */
export function finalizeIdentifyConfidence<
  T extends {
    printKey: string;
    distance: number;
    ambiguous?: boolean;
    votes?: number;
  },
>(
  matches: readonly T[],
  method: "embed" | "dhash" | "hybrid",
  opts?: { ocrReinforced?: boolean },
): { matches: T[]; confidence: IdentifyConfidence } {
  if (!matches.length) {
    return { matches: [], confidence: "miss" };
  }

  // Soft embed-only shortlist → miss (weak nearest neighbors).
  if (
    method === "embed" &&
    matches[0]!.distance > IDENTIFY_EMBED_SHORTLIST_MAX
  ) {
    return { matches: [], confidence: "miss" };
  }

  const scoped = sameGameOrAbstain(matches);
  if (!scoped.length) {
    return { matches: [], confidence: "miss" };
  }

  const top = scoped[0]!;
  const second = scoped[1];
  const ocrReinforced = method === "embed" && Boolean(opts?.ocrReinforced);
  const sureDist =
    method === "embed"
      ? ocrReinforced
        ? IDENTIFY_SURE_EMBED_OCR
        : IDENTIFY_SURE_EMBED
      : IDENTIFY_SURE_DHASH;
  const sureMargin =
    method === "embed"
      ? IDENTIFY_SURE_MARGIN_EMBED
      : IDENTIFY_SURE_MARGIN_DHASH;
  const marginOk =
    !second || ocrReinforced || second.distance - top.distance >= sureMargin;

  // Multi-signal vote (dHash+aHash+color): ≥2 channels agree → slightly
  // looser distance still counts as sure (production scanners do the same).
  const reinforced =
    method === "dhash" &&
    (top.votes ?? 0) >= 2 &&
    top.distance <= IDENTIFY_SURE_DHASH + 3;

  // Hybrid disagree stays doubt even with a wide margin — signals conflict.
  const sure =
    method !== "hybrid" && marginOk && (top.distance <= sureDist || reinforced);

  if (sure) {
    const { ambiguous: _a, ...rest } = top;
    return {
      matches: [{ ...rest, ambiguous: undefined } as T],
      confidence: "sure",
    };
  }

  const trimmed = trimDoubtShortlist(scoped, method);
  return {
    matches: trimmed.map((row) => ({ ...row, ambiguous: true })),
    confidence: "doubt",
  };
}
