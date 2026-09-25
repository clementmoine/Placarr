/**
 * Parse Bleach FR starter decklists from carddass.fr catalogue HTML (Wayback).
 */
export type BleachStarterLine = {
  qty: number;
  printed: string;
  nameFr?: string;
};

export type BleachStarterDeck = {
  slug: string;
  nameFr: string;
  lines: BleachStarterLine[];
};

const LINE_RE =
  /(\d+)\s+([^\n\r]*?)\s+([ACEZP])-?(\d{3})\b/gi;

/** Extract `qty Name CODE` rows from a deck-contents HTML/text block. */
export function parseBleachStarterLines(block: string): BleachStarterLine[] {
  const out: BleachStarterLine[] = [];
  const seen = new Set<string>();
  for (const m of block.matchAll(LINE_RE)) {
    const qty = Number(m[1]);
    const nameFr = m[2]!.replace(/\s+/g, " ").trim() || undefined;
    const printed = `${m[3]!.toUpperCase()}${m[4]!}`;
    if (!Number.isFinite(qty) || qty < 1 || qty > 9) continue;
    if (seen.has(printed)) continue;
    seen.add(printed);
    out.push({ qty, printed, nameFr });
  }
  return out;
}

/**
 * Split S1 catalogue HTML into Compagnons / Rivaux decks.
 * Source: `curated/sources/wayback/bleach-s1.html` (Wayback carddass.fr S1).
 */
export function parseBleachS1StarterDecks(html: string): BleachStarterDeck[] {
  const normalized = html
    .replace(/&quot;/g, '"')
    .replace(/&agrave;/gi, "à")
    .replace(/&eacute;/gi, "é")
    .replace(/&egrave;/gi, "è")
    .replace(/&ecirc;/gi, "ê")
    .replace(/&acirc;/gi, "â")
    .replace(/&nbsp;/gi, " ");

  const decks: BleachStarterDeck[] = [];
  const specs: Array<{ slug: string; nameFr: string; marker: string }> = [
    {
      slug: "starter-compagnons",
      nameFr: 'Starter "Compagnons"',
      marker: 'Starter "Compagnons"',
    },
    {
      slug: "starter-rivaux",
      nameFr: 'Starter "Rivaux"',
      marker: 'Starter "Rivaux"',
    },
  ];

  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i]!;
    const start = normalized.indexOf(spec.marker);
    if (start < 0) continue;
    const next = specs[i + 1]
      ? normalized.indexOf(specs[i + 1]!.marker, start + 1)
      : -1;
    const chunk =
      next > start
        ? normalized.slice(start, next)
        : normalized.slice(start, start + 8_000);
    const containIdx = chunk.toLowerCase().indexOf("ce deck contient");
    const block = containIdx >= 0 ? chunk.slice(containIdx) : chunk;
    const lines = parseBleachStarterLines(block);
    if (lines.length) {
      decks.push({ slug: spec.slug, nameFr: spec.nameFr, lines });
    }
  }
  return decks;
}

export function bleachPrintedToPrintKey(printed: string): string | null {
  const m = printed.trim().toUpperCase().match(/^([ACEZP])(\d{3})$/);
  if (!m) return null;
  return `bleachscb:${m[1]!.toLowerCase()}-${m[2]!}`;
}
