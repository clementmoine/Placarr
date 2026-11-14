/**
 * Local merge-map keys used during enrich — not registry provider ids.
 * Must never become `external-link` fact `source` / UI labels.
 */
export const CACHED_FICHE_MERGE_KEY = "__cached_fiche__";

/** Shelf sealed SKU (`packId::slug`) carried into adapter `externalIds`. */
export const SKU_KEY_MERGE_KEY = "__skuKey";

/** Kinds the seeded fiche may still contribute on refresh (gap-fill only). */
const CACHED_FICHE_MERGE_FACT_KINDS = new Set([
  "external-link",
  "identifier",
  "price",
  "source-url",
]);

/**
 * Cover rows the live providers re-emit. A stored pin must not re-enter the
 * merge: its provenance was stamped on an older pass and outranks a fresh
 * photo demotion of the same file (Coleka listing vs Carddass scan).
 */
const CACHED_FICHE_COVER_TYPES = new Set(["cover", "artwork", "image"]);

export function isInternalMetadataMergeKey(
  providerId: string | null | undefined,
): boolean {
  const id = providerId?.trim();
  if (!id) return false;
  return id === CACHED_FICHE_MERGE_KEY || id.startsWith("__");
}

/**
 * Drop catalog/display facts and cover pins from the seeded fiche before
 * merging with live providers. Otherwise stale slots (Numéro `11`, a Coleka
 * photo still stamped `catalog`) outrank the fresh hit: the seed is applied
 * beside the provider that just re-ranked the same file.
 */
export function metadataForCachedFicheMerge<
  T extends {
    facts?: ReadonlyArray<{ kind: string }> | null;
    imageUrl?: string | null;
    heroImageUrl?: string | null;
    attachments?: ReadonlyArray<{ type?: string | null }> | null;
  },
>(metadata: T): T {
  const facts = metadata.facts?.filter((fact) =>
    CACHED_FICHE_MERGE_FACT_KINDS.has(fact.kind),
  );
  const attachments = metadata.attachments?.filter(
    (attachment) =>
      !CACHED_FICHE_COVER_TYPES.has((attachment.type ?? "").toLowerCase()),
  );
  return {
    ...metadata,
    facts,
    attachments,
    imageUrl: undefined,
    heroImageUrl: undefined,
  };
}
