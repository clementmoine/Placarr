import { matchPriceSeekQueries } from "@/core/catalog/matchContext";

/** Extra marketplace query shapes (accents stripped, n° → N) for Browse API search. */
export function ebayMarketplaceQueryVariants(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };

  for (const query of queries) {
    add(query);
    const ascii = query
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\bn[°º]\s*/gi, " N ")
      .replace(/\s+/g, " ")
      .trim();
    add(ascii);
  }

  return out;
}

/**
 * Price seek queries: `matchPriceSeekQueries` (barcode first, ≤1/2 titles)
 * plus accent/`n°` marketplace variants — still capped at 4 HTTP seeks.
 */
export function ebayPriceSearchQueries(
  primaryName: string,
  fallbackNames: string[],
  cleanedBarcode = "",
): string[] {
  const code = cleanedBarcode.trim();
  const base = matchPriceSeekQueries({
    barcodes: code ? [code] : [],
    cleanedBarcode: code,
    primaryName,
    fallbackNames,
  });
  return ebayMarketplaceQueryVariants(base).slice(0, 4);
}
