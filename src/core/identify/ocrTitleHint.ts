/**
 * Title / description tokens from OCR — a clue, never a sure identity.
 *
 * Used when the footer has no collector number (many objects, unique versos).
 * Only reorders an existing shortlist; does not invent printKeys.
 */

const STOP = new Set([
  "the",
  "and",
  "des",
  "les",
  "une",
  "uni",
  "du",
  "de",
  "la",
  "le",
  "el",
  "los",
  "las",
  "von",
  "der",
  "die",
  "das",
  "card",
  "carte",
]);

/** Meaningful words from an OCR line — collector-like tokens are left out. */
export function ocrTitleTokens(text: string | null | undefined): string[] {
  const raw = text?.normalize("NFKD").replace(/\p{M}/gu, "") ?? "";
  const words = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)];
}

export function titleTokenHits(
  title: string | null | undefined,
  tokens: readonly string[],
): number {
  if (!tokens.length) return 0;
  const hay = (title ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (!hay) return 0;
  let n = 0;
  for (const t of tokens) {
    if (hay.includes(t)) n += 1;
  }
  return n;
}

/**
 * Boost shortlist rows whose catalogue title contains OCR name tokens.
 * Does not invent candidates; does not change distances.
 */
export function rerankMatchesByTitleTokens<
  T extends { printKey: string; distance: number },
>(
  matches: readonly T[],
  tokens: readonly string[],
  titleOf: (printKey: string) => string | null | undefined,
): T[] {
  if (!tokens.length || matches.length < 2) return [...matches];
  const scored = matches.map((row, index) => ({
    row,
    index,
    hits: titleTokenHits(titleOf(row.printKey), tokens),
  }));
  scored.sort((a, b) => {
    if (a.hits !== b.hits) return b.hits - a.hits;
    return a.row.distance - b.row.distance || a.index - b.index;
  });
  return scored.map((s) => s.row);
}
