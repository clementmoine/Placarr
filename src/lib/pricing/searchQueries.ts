function normalizedShelfName(shelfName?: string | null): string {
  return (shelfName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function physicalMediaHintsFromShelfName(
  shelfName?: string | null,
): string[] {
  const shelf = normalizedShelfName(shelfName);
  const hints: string[] = [];
  if (/bluray|blu-ray|4k|uhd/.test(shelf)) hints.push("bluray");
  if (/\bdvd\b/.test(shelf)) hints.push("dvd");
  if (/vinyl|disque/.test(shelf)) hints.push("vinyl");
  if (/\bcd\b/.test(shelf)) hints.push("cd");
  return hints;
}

/** Marketplace queries: media-specific variants first, then bare titles. */
export function buildPriceSearchQueries(
  names: string[],
  shelfName?: string | null,
): string[] {
  const hints = physicalMediaHintsFromShelfName(shelfName);
  const queries: string[] = [];
  const seen = new Set<string>();

  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push(trimmed);
  };

  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    for (const hint of hints) {
      if (!trimmed.toLowerCase().includes(hint)) {
        add(`${trimmed} ${hint}`);
      }
    }
    add(trimmed);
  }

  return queries;
}
