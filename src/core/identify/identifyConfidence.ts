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

/** Distance ceilings to promote a single "sure" hit (stricter than shortlist). */
export const IDENTIFY_SURE_DHASH = 4;
export const IDENTIFY_SURE_EMBED = 55;
/**
 * Soft CLIP shortlist ceiling (milli). Above this, embed-only hits are miss —
 * same threshold as pickHybridIdentifyMatches embedSoft default.
 */
export const IDENTIFY_EMBED_SHORTLIST_MAX = 280;
/** #2 must be at least this far behind #1 (same distance units). */
export const IDENTIFY_SURE_MARGIN_DHASH = 3;
export const IDENTIFY_SURE_MARGIN_EMBED = 35;

/**
 * Doubt carousel radius from #1 — drop far FP neighbors (e.g. Tenten next to
 * a clear Shikamaru) while keeping near reprints / twin arts.
 */
export const IDENTIFY_DOUBT_RADIUS_DHASH = 6;
export const IDENTIFY_DOUBT_RADIUS_EMBED = 70;
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
 * Live phone CLIP rarely reaches {@link IDENTIFY_SURE_EMBED} (55). When OCR
 * set+number already agrees with #1 and the margin is clear, allow a looser
 * sure ceiling — still well under the soft shortlist max.
 */
export const IDENTIFY_SURE_EMBED_OCR = 160;

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

  // Soft embed-only shortlist → miss (weak CLIP nearest neighbors).
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
  const sureDist =
    method === "embed"
      ? opts?.ocrReinforced
        ? IDENTIFY_SURE_EMBED_OCR
        : IDENTIFY_SURE_EMBED
      : IDENTIFY_SURE_DHASH;
  const sureMargin =
    method === "embed"
      ? IDENTIFY_SURE_MARGIN_EMBED
      : IDENTIFY_SURE_MARGIN_DHASH;
  const marginOk = !second || second.distance - top.distance >= sureMargin;

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
