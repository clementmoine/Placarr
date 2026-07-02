import { normalizeProductBarcode } from "@/lib/barcode/normalize";

/** Extracts product barcodes embedded in retailer URL slugs. */
function barcodesEmbeddedInUrl(url: string): string[] {
  const matches = url.match(/\d{8,14}/g) ?? [];
  return matches
    .map((value) => normalizeProductBarcode(value))
    .filter((value): value is string => Boolean(value));
}

/**
 * True when a catalog URL advertises a different EAN than the item being
 * enriched (e.g. Gentlemen du Jeu slug ending in 827912079678).
 */
export function retailerProductUrlBarcodeConflicts(
  productUrl: string | undefined | null,
  itemBarcode: string | null | undefined,
): boolean {
  const normalizedItemBarcode = normalizeProductBarcode(itemBarcode);
  if (!normalizedItemBarcode || !productUrl?.trim()) return false;

  const embedded = barcodesEmbeddedInUrl(productUrl);
  if (embedded.length === 0) return false;

  return embedded.some((value) => value !== normalizedItemBarcode);
}
