import { cleanCode } from "@/core/barcode/query";

/** Bulk-scan fallback names like « Objet 0087169139499 » / « Item 0087169139499 ». */
const BARCODE_PLACEHOLDER_NAME = /^(objet|item)\s+(\d{8,14})$/i;

/** Temporary item name used before metadata enrichment resolves a catalog title. */
export function buildBarcodePlaceholderItemName(
  barcode: string,
  prefix: "Objet" | "Item" = "Objet",
): string {
  const digits = cleanCode(barcode);
  return digits.length >= 8
    ? `${prefix} ${digits}`
    : `${prefix} ${barcode.trim()}`;
}

/**
 * True when the stored item name is still the scan placeholder (barcode-only),
 * so a retailer-confirmed EAN should be enough to accept the catalog hit.
 */
export function isBarcodePlaceholderItemName(
  name: string,
  barcode?: string | null,
): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;

  const placeholderMatch = BARCODE_PLACEHOLDER_NAME.exec(trimmed);
  if (placeholderMatch) {
    const digits = cleanCode(placeholderMatch[2]);
    const normalizedBarcode = cleanCode(barcode);
    return !normalizedBarcode || digits === normalizedBarcode;
  }

  const digitsOnly = cleanCode(trimmed);
  if (digitsOnly.length < 8) return false;

  const normalizedBarcode = cleanCode(barcode);
  if (normalizedBarcode && digitsOnly === normalizedBarcode) {
    return trimmed.replace(/\D/g, "") === digitsOnly;
  }

  return false;
}
