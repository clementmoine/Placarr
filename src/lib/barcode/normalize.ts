import { cleanCode } from "@/lib/barcode/query";

export function normalizeProductBarcode(
  value?: string | null,
): string | null {
  const cleaned = cleanCode(value);
  if (!cleaned) return null;
  if (cleaned.length < 8 || cleaned.length > 14) return null;
  return cleaned;
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
