/**
 * Site-root paths this app actually serves.
 *
 * `/uploads/` holds images we localized; `/assets/` holds the local pack
 * corpora (`data/<pack>/`), which is where a card picked from a closed
 * catalogue gets its face — that pack has no remote URL to fall back on.
 *
 * Kept in one leaf module with no imports, because both the server enrichment
 * path and client components (the item form's validation) have to agree on it.
 * They did not: the form accepted only `/uploads/`, so saving any card served
 * from `/assets/` failed validation on a tab the user could not see — the
 * Enregistrer button simply did nothing.
 */
export const SERVED_LOCAL_PREFIXES = ["/uploads/", "/assets/"] as const;

/** Whether a site-root path points at something this app serves. */
export function isServedLocalPath(url: string): boolean {
  return SERVED_LOCAL_PREFIXES.some((prefix) => url.startsWith(prefix));
}
