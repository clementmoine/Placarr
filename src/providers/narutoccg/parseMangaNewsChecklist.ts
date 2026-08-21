/**
 * Parse Manga-News TCG Naruto deck goodie pages (FR checklist text).
 * Pure — no I/O.
 *
 * Lines look like: `NI-01 Naruto Uzumaki / Holo`
 * or `TE-54 La Lame du vent / Commune`
 */

export type MangaNewsCardType = "ni" | "te" | "ta" | "cl";

export type MangaNewsRarity = "commune" | "holo" | "unknown";

export type MangaNewsChecklistLine = {
  type: MangaNewsCardType;
  /** Digits as listed (no forced padding), e.g. "1" or "190" */
  numberDigits: string;
  /** Canonical Placarr-ish number: ni001 / ta190 */
  number: string;
  name: string;
  rarity: MangaNewsRarity;
  /** Raw matched line (trimmed) */
  raw: string;
};

export type MangaNewsDeckMeta = {
  slug: string;
  /** s1 … s5 or ns */
  setHint: string;
  title: string;
  url: string;
};

/** Known Manga-News deck goodies for FR CACG (+ Nouvelle Série blurb-only). */
export const MANGA_NEWS_DECKS: readonly MangaNewsDeckMeta[] = [
  {
    slug: "Naruto-Deck-Serie-1",
    setHint: "s1",
    title: "Naruto - Deck Serie 1",
    url: "https://www.manga-news.com/index.php/goodie/Naruto-Deck-Serie-1",
  },
  {
    slug: "Naruto-Deck-Serie-2",
    setHint: "s2",
    title: "Naruto - Deck Serie 2",
    url: "https://www.manga-news.com/index.php/goodie/Naruto-Deck-Serie-2",
  },
  {
    slug: "Naruto-Deck-Serie-3",
    setHint: "s3",
    title: "Naruto - Deck Serie 3",
    url: "https://www.manga-news.com/index.php/goodie/Naruto-Deck-Serie-3",
  },
  {
    slug: "Naruto-Deck-Serie-4",
    setHint: "s4",
    title: "Naruto - Deck Serie 4",
    url: "https://www.manga-news.com/index.php/goodie/Naruto-Deck-Serie-4",
  },
  {
    slug: "Naruto-Deck-Serie-5",
    setHint: "s5",
    title: "Naruto - Deck Serie 5",
    url: "https://www.manga-news.com/index.php/goodie/Naruto-Deck-Serie-5",
  },
  {
    slug: "Naruto-Deck-Nouvelle-Serie",
    setHint: "ns",
    title: "Naruto - Deck Nouvelle Serie",
    url: "https://www.manga-news.com/index.php/goodie/Naruto-Deck-Nouvelle-Serie",
  },
] as const;

const LINE_RE =
  /^(NI|TE|TA|CL)[\s_-]*0*(\d+)\s+(.+?)\s*\/\s*(Holo|Commune)\s*$/i;

export function normalizeCardNumber(
  type: MangaNewsCardType,
  digits: string | number,
): string {
  const n = typeof digits === "number" ? digits : Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 0) {
    return `${type}${String(digits).replace(/\D/g, "")}`;
  }
  return `${type}${String(n).padStart(3, "0")}`;
}

export function parseMangaNewsRarity(raw: string): MangaNewsRarity {
  const t = raw.trim().toLowerCase();
  if (t === "holo") return "holo";
  if (t === "commune") return "commune";
  return "unknown";
}

/**
 * Extract checklist rows from a Manga-News goodie page body (HTML or markdown-ish text).
 */
export function parseMangaNewsChecklistText(
  text: string,
): MangaNewsChecklistLine[] {
  const out: MangaNewsChecklistLine[] = [];
  const seenRaw = new Set<string>();

  for (const rough of text.split(/\r?\n|<br\s*\/?>/i)) {
    const line = rough
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) continue;
    const m = line.match(LINE_RE);
    if (!m) continue;

    const type = m[1]!.toLowerCase() as MangaNewsCardType;
    const numberDigits = String(Number.parseInt(m[2]!, 10));
    const name = m[3]!.trim().replace(/\s+/g, " ");
    const rarity = parseMangaNewsRarity(m[4]!);
    const number = normalizeCardNumber(type, numberDigits);
    const key = `${number}|${name}|${rarity}`;
    if (seenRaw.has(key)) continue;
    seenRaw.add(key);

    out.push({
      type,
      numberDigits,
      number,
      name,
      rarity,
      raw: line,
    });
  }

  return out;
}

/** Unique collector numbers in a deck list (reprints collapse). */
export function uniqueNumbers(
  lines: readonly MangaNewsChecklistLine[],
): string[] {
  const set = new Set<string>();
  for (const line of lines) set.add(line.number);
  return [...set].sort();
}

/**
 * Packshot of the deck itself, not a card.
 *
 * Prefer `og:image` when it is the goodie (`tcg-naruto-deck-…`). The same
 * page also lists unrelated shop thumbs under `/public/images/goodies/`.
 */
function deckImageScore(url: string): number {
  const name = url.split("/").pop() ?? "";
  if (name.startsWith(".")) return 0;
  if (/_medium\./i.test(name)) return 1;
  return 2;
}

export function mangaNewsDeckImageUrl(html: string): string | null {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (url: string | undefined) => {
    const clean = url?.trim();
    if (!clean || !/tcg-naruto-deck/i.test(clean) || seen.has(clean)) return;
    seen.add(clean);
    candidates.push(clean);
  };

  const og =
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(
      html,
    ) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(
      html,
    );
  add(og?.[1]);
  for (const match of html.matchAll(
    /https?:\/\/[^"' ]+\/public\/images\/goodies\/\.?tcg-naruto-deck[^"' ]+/gi,
  )) {
    add(match[0]);
  }
  candidates.sort((a, b) => deckImageScore(b) - deckImageScore(a));
  return candidates[0] ?? null;
}

/** Strip scripts/styles then keep text-ish content for the line parser. */
export function htmlToChecklistText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8364;/g, "€")
    .replace(/&nbsp;/gi, " ");
}
