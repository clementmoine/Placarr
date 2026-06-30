/**
 * Cover provenance — the factual *source context* of a cover image.
 *
 * This is the Image **Tier** of `docs/unbiased_ranking.md` §5: it is provenance,
 * not a quality score, and not a provider privilege. A clean catalog render of a
 * product outranks a photographed copy of the same region/platform because the
 * observation is intrinsically a better display candidate — decided as an ordered
 * tier, never via an additive weight.
 *
 *   catalog       — clean catalog render / packshot (product fiche art)
 *   listing_photo — marketplace photo of a copy (a seller's catalogue shot)
 *   user_photo    — user-uploaded photo of an owned/used copy
 *
 * The provenance of a given image is observed from provider-declared, URL-derived
 * rules (see `ProviderInfo.coverProvenanceRules`) and persisted at enrichment.
 * Any provider emitting the same kind of observation is treated identically — no
 * provider id appears here.
 */
export const COVER_PROVENANCE_ORDER = [
  "catalog",
  "listing_photo",
  "user_photo",
] as const;

export type CoverProvenance = (typeof COVER_PROVENANCE_ORDER)[number];

/**
 * Lexicographic rank for the provenance tier (lower = better display candidate).
 * An unknown/absent provenance ranks as `catalog`: we never demote an image
 * without positive evidence that it is a photographed copy.
 */
export function coverProvenanceRank(provenance?: string | null): number {
  if (!provenance) return 0;
  const index = COVER_PROVENANCE_ORDER.indexOf(provenance as CoverProvenance);
  return index === -1 ? 0 : index;
}

export interface CoverProvenanceSignals {
  /** Provider-declared, URL-derived provenance — persisted at enrichment. */
  provenance?: string | null;
}

/**
 * Resolve the effective provenance from the observed signals. A provider-declared
 * provenance is authoritative; everything else defaults to `catalog` — we never
 * demote an image without positive evidence that it is a photographed copy.
 */
export function resolveCoverProvenance(
  signals: CoverProvenanceSignals,
): CoverProvenance {
  const declared = signals.provenance;
  if (
    declared &&
    COVER_PROVENANCE_ORDER.includes(declared as CoverProvenance)
  ) {
    return declared as CoverProvenance;
  }
  return "catalog";
}
