/**
 * Data Carddass — pas de SKU scellé retail attesté dans ce pass.
 * Les cartes viennent de la borne / boosters arcade ; packshots à coller plus tard.
 */
export function ingestDataCarddassSealedProducts(): {
  written: number;
  skipped: number;
  file: string;
} {
  return { written: 0, skipped: 0, file: "" };
}
