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

export function ebayPriceSearchQueries(
  primaryName: string,
  fallbackNames: string[],
  cleanedBarcode = "",
): string[] {
  return ebayMarketplaceQueryVariants(
    Array.from(
      new Set([cleanedBarcode, primaryName, ...fallbackNames].filter(Boolean)),
    ),
  ).slice(0, 4);
}
