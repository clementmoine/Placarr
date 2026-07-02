import { parseRatingRatio } from "@/lib/metadata/consensus";
import type { MetadataFact } from "@/types/metadataProvider";

/** Highest parseable rating ratio (0..1) across rating facts, or null. */
export function bestRatingRatioFromFacts(
  facts: MetadataFact[] | null | undefined,
): number | null {
  if (!facts?.length) return null;

  let best: number | null = null;
  for (const fact of facts) {
    if (fact?.kind !== "rating" || typeof fact.value !== "string") continue;
    const ratio = parseRatingRatio(fact.value);
    if (ratio !== null && (best === null || ratio > best)) {
      best = ratio;
    }
  }
  return best;
}

/** Rating on a 0..10 scale for display, filters, and sort. */
export function getItemRatingScore10(
  facts: MetadataFact[] | null | undefined,
): number | null {
  const ratio = bestRatingRatioFromFacts(facts);
  return ratio === null ? null : Math.round(ratio * 100) / 10;
}
