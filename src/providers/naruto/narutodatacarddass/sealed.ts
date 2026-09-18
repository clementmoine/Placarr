/**
 * Data Carddass — pas de SKU scellé retail attesté (cartes borne / boosters arcade).
 * Packshots produit à coller quand une source retail fiable apparaît.
 */
export function ingestDataCarddassSealedProducts(): {
  written: number;
  skipped: number;
  file: string;
} {
  return { written: 0, skipped: 0, file: "" };
}
