import { normalizeProductBarcode } from "@/lib/barcode/normalize";

/** Extract the primary EAN/GTIN from a PriceCharting product detail HTML page. */
export function parsePriceChartingBarcode(html: string): string | undefined {
  const match = html.match(/EAN\s*\/\s*GTIN:<\/td>\s*<td[^>]*>\s*([\d,\s]+)/i);
  if (!match?.[1]) return undefined;

  const candidates = match[1]
    .split(",")
    .map((value) => normalizeProductBarcode(value))
    .filter((value): value is string => Boolean(value));

  return (
    candidates.find((value) => value.length === 13) ||
    candidates.find((value) => value.length === 12) ||
    candidates[0]
  );
}
