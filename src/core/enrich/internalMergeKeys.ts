/**
 * Local merge-map keys used during enrich — not registry provider ids.
 * Must never become `external-link` fact `source` / UI labels.
 */
export const CACHED_FICHE_MERGE_KEY = "__cached_fiche__";

export function isInternalMetadataMergeKey(
  providerId: string | null | undefined,
): boolean {
  const id = providerId?.trim();
  if (!id) return false;
  return id === CACHED_FICHE_MERGE_KEY || id.startsWith("__");
}
