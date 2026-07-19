import { cleanCode } from "@/core/identify/query";

export function normalizeProductBarcode(value?: string | null): string | null {
  const cleaned = cleanCode(value);
  if (!cleaned) return null;
  if (cleaned.length < 8 || cleaned.length > 14) return null;
  return cleaned;
}

/**
 * Whether a product barcode suggests a PAL/EU catalog region (PriceCharting
 * `pal-*` platforms, EU box art, …).
 *
 * - Empty → true (name-only lookups default to PAL for Placarr)
 * - Leading `0` (UPC-A / UPC written as EAN-13) → NTSC / Americas
 * - Other 12–13 digit codes (EU GS1 prefixes, EAN without check digit) → PAL
 *
 * Example: `805529493537` (12 digits, Italy prefix) must not be treated as
 * NTSC just because it is not 13 digits — that wrongly linked Voodoo Vince PAL
 * to `/game/xbox/…` instead of `/game/pal-xbox/…`.
 */
export function barcodeSuggestsPalRegion(barcode?: string | null): boolean {
  const cleaned = cleanCode(barcode);
  if (!cleaned) return true;
  return !cleaned.startsWith("0");
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
