import { cleanCode } from "@/core/barcode/query";

import { isBarcodePlaceholderItemName } from "./placeholderName";

/** Lookup string for provider metadata fetch / refresh. */
export function resolveItemMetadataLookupQuery(input: {
  name: string;
  barcode?: string | null;
  metadataTitle?: string | null;
  explicitQuery?: string | null;
}): string {
  const explicit = input.explicitQuery?.trim();
  if (explicit) return explicit;

  const barcodeDigits = cleanCode(input.barcode);
  if (
    barcodeDigits.length >= 8 &&
    isBarcodePlaceholderItemName(input.name, input.barcode)
  ) {
    return barcodeDigits;
  }

  return input.metadataTitle?.trim() || input.name.trim();
}
