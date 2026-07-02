import type { MetadataFact } from "@/types/metadataProvider";

/**
 * Type-agnostic grouping concept: the brand/universe a standalone item belongs to
 * (a games franchise, a film collection, a book/comic line…). One stable `kind`
 * fits every media type; the display `label` can be localized later ("Saga",
 * "Collection", "Univers") without ever changing the concept.
 *
 * Reserved word note: we deliberately use "franchise", not "collection", because
 * a user's library/shelves are already *their* collection in Placarr — overloading
 * the word would be confusing in code and UI.
 */
export const FRANCHISE_FACT_KIND = "franchise";

/**
 * Builds the franchise grouping fact from a provider-declared franchise/collection
 * name. This must come from a provider *observation* (IGDB franchise/collection,
 * TMDB belongs_to_collection…), never from title-prefix heuristics — guessing a
 * franchise from titles is exactly the confident-false-positive trap our
 * principles forbid (e.g. "Mario Kart" vs "Mario Party", reboots with no shared
 * prefix). Returns `[]` for an empty name so callers can spread it unconditionally.
 */
export function buildFranchiseFact(
  name: string | null | undefined,
  source: string,
): MetadataFact[] {
  const value = name?.trim();
  if (!value) return [];

  return [
    {
      kind: FRANCHISE_FACT_KIND,
      label: "Franchise",
      value,
      source,
      confidence: 0.8,
      priority: 55,
    },
  ];
}
