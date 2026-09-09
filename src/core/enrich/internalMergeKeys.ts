/**
 * Local merge-map keys used during enrich — not registry provider ids.
 * Must never become `external-link` fact `source` / UI labels.
 */
export const CACHED_FICHE_MERGE_KEY = "__cached_fiche__";

/** Kinds the seeded fiche may still contribute on refresh (gap-fill only). */
const CACHED_FICHE_MERGE_FACT_KINDS = new Set([
  "external-link",
  "identifier",
  "price",
  "source-url",
]);

export function isInternalMetadataMergeKey(
  providerId: string | null | undefined,
): boolean {
  const id = providerId?.trim();
  if (!id) return false;
  return id === CACHED_FICHE_MERGE_KEY || id.startsWith("__");
}

/**
 * Drop catalog/display facts from the seeded fiche before merging with live
 * providers. Otherwise stale slots (Numéro `11`, Type `Pokémon`) outrank the
 * fresh TCGdex hit because the seed is applied last under the same source.
 */
export function metadataForCachedFicheMerge<
  T extends { facts?: ReadonlyArray<{ kind: string }> | null },
>(metadata: T): T {
  const facts = metadata.facts;
  if (!facts?.length) return metadata;
  return {
    ...metadata,
    facts: facts.filter((fact) => CACHED_FICHE_MERGE_FACT_KINDS.has(fact.kind)),
  };
}
