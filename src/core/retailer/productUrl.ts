import {
  barcodesEquivalent,
  normalizeProductBarcode,
} from "@/core/barcode/normalize";

/** Extracts product barcodes embedded in retailer URL slugs. */
export function barcodesEmbeddedInUrl(url: string): string[] {
  const matches = url.match(/\d{8,14}/g) ?? [];
  return matches
    .map((value) => normalizeProductBarcode(value))
    .filter((value): value is string => Boolean(value));
}

/**
 * True when the catalog product is tied to the item EAN (page field or slug).
 * Used to reject homonym catalog rows once an item barcode is known.
 */
export function retailerProductBarcodeConfirmed(
  productUrl: string | null | undefined,
  productBarcode: string | null | undefined,
  itemBarcode: string | null | undefined,
): boolean {
  const normalizedItemBarcode = normalizeProductBarcode(itemBarcode);
  if (!normalizedItemBarcode) return false;

  const normalizedProductBarcode = normalizeProductBarcode(productBarcode);
  if (
    normalizedProductBarcode &&
    barcodesEquivalent(normalizedProductBarcode, normalizedItemBarcode)
  ) {
    return true;
  }

  if (!productUrl?.trim()) return false;
  if (retailerProductUrlBarcodeConflicts(productUrl, normalizedItemBarcode)) {
    return false;
  }

  return barcodesEmbeddedInUrl(productUrl).some((embedded) =>
    barcodesEquivalent(embedded, normalizedItemBarcode),
  );
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

  return embedded.some(
    (value) => !barcodesEquivalent(value, normalizedItemBarcode),
  );
}

export type RetailerCatalogBarcodeGate = {
  catalogBarcodeConfirmed: boolean;
  barcodeContradicted: boolean;
  urlBarcodeConflicts: boolean;
};

/** Barcode alignment for retailer catalog rows (field, slug, conflicts). */
export function retailerCatalogBarcodeGate(input: {
  productUrl?: string | null;
  productBarcode?: string | null;
  itemBarcode?: string | null;
}): RetailerCatalogBarcodeGate {
  const normalizedItemBarcode = normalizeProductBarcode(input.itemBarcode);
  const resolvedBarcode = normalizeProductBarcode(input.productBarcode);

  const barcodeConfirmed =
    !!normalizedItemBarcode &&
    !!resolvedBarcode &&
    barcodesEquivalent(resolvedBarcode, normalizedItemBarcode);
  const urlBarcodeConfirmed = retailerProductBarcodeConfirmed(
    input.productUrl,
    resolvedBarcode,
    normalizedItemBarcode,
  );

  return {
    catalogBarcodeConfirmed: barcodeConfirmed || urlBarcodeConfirmed,
    barcodeContradicted:
      !!normalizedItemBarcode &&
      !!resolvedBarcode &&
      !barcodesEquivalent(resolvedBarcode, normalizedItemBarcode),
    urlBarcodeConflicts:
      !!normalizedItemBarcode &&
      retailerProductUrlBarcodeConflicts(
        input.productUrl,
        normalizedItemBarcode,
      ),
  };
}

/**
 * True when the source exposes a GTIN/EAN/UPC (field or URL slug) that differs
 * from the item barcode. Absence of barcode on the source is not a rejection —
 * title alignment may still accept the row.
 */
export function retailerBarcodeContradictsItem(input: {
  productUrl?: string | null;
  productBarcode?: string | null;
  itemBarcode?: string | null;
}): boolean {
  const gate = retailerCatalogBarcodeGate(input);
  return gate.barcodeContradicted || gate.urlBarcodeConflicts;
}
