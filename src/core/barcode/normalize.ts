import { cleanCode } from "@/core/barcode/query";

export function normalizeProductBarcode(value?: string | null): string | null {
  const cleaned = cleanCode(value);
  if (!cleaned) return null;
  if (cleaned.length < 8 || cleaned.length > 14) return null;
  return cleaned;
}

/** Compares EAN/UPC variants that differ only by leading zeros. */
export function barcodeMatchKey(value?: string | null): string {
  return cleanCode(value).replace(/^0+/, "");
}

export function barcodesEquivalent(
  left?: string | null,
  right?: string | null,
): boolean {
  const a = barcodeMatchKey(left);
  const b = barcodeMatchKey(right);
  return Boolean(a && b && a === b);
}

export function pickDiscoveredBarcode(
  candidates: Array<string | null | undefined>,
): string | null {
  const normalized = candidates
    .map((candidate) => normalizeProductBarcode(candidate))
    .filter((candidate): candidate is string => Boolean(candidate));

  if (normalized.length === 0) return null;

  const unique = Array.from(new Set(normalized));
  return (
    unique.find((value) => value.length === 13) ||
    unique.find((value) => value.length === 12) ||
    unique[0]
  );
}
