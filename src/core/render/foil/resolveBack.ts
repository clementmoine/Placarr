import {
  pickDefaultCardBack,
  resolveCardBackCandidates,
  type CardBackCandidate,
} from "./cardBacks";

export type { CardBackCandidate, CardBackScope } from "./cardBacks";
export {
  pickDefaultCardBack,
  rankCardBacks,
  resolveCardBackCandidates,
  resolveSharedCardBackSkeleton,
  sharedCardBackSkeletonUrl,
} from "./cardBacks";

/**
 * Resolve the default card-back URL for an item: print (alt face) > set > pack.
 * No shelf override — backs live on the print/pack, not the collection.
 */
export function resolveCardBackUrl(opts: {
  printCardBackUrl?: string | null;
  printKey?: string | null;
  setCode?: string | null;
  effectPackId?: string | null;
  providerId?: string | null;
}): string | null {
  return pickDefaultCardBack(resolveCardBackCandidates(opts))?.url ?? null;
}

/** Full default candidate (scope included) — for skeleton / Face·Dos UI. */
export function resolveDefaultCardBack(
  opts: Parameters<typeof resolveCardBackCandidates>[0],
): CardBackCandidate | null {
  return pickDefaultCardBack(resolveCardBackCandidates(opts));
}
