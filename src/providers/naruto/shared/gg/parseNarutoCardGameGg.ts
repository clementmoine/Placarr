/**
 * Parser d’archives narutocardgame.gg (classic-ccg / kayou / mythos).
 *
 * Une page d’index lie `/archive/{line}/{set-or-cards}/{id}-{slug}`.
 */
export type GgArchiveLine = "classic-ccg" | "kayou" | "mythos";

export type GgCard = {
  /** `n`, `j`, `nrz08`, `ks`… tel que l’URL le porte. */
  prefix: string;
  number: number;
  /** Segment set / dossier dans l’URL. */
  set: string;
  /** Slug du nom. */
  slug: string;
  /** Identifiant brut de l’URL (ex. `n001`, `nrz08-asp-001`, `ks-000`). */
  rawId: string;
  line: GgArchiveLine;
};

const CLASSIC_HREF =
  /href="\/archive\/classic-ccg\/([a-z0-9-]+)\/([a-z]+)(\d+)-([a-z0-9-]+)"/gi;

/** Kayou / Mythos : `/archive/{line}/cards/{id}-{slug}` (id contains hyphens). */
const COMPOUND_CARD_HREF =
  /href="\/archive\/(kayou|mythos)\/cards\/([a-z0-9-]+)"/gi;

/**
 * Split `nrz08-asp-001` → prefix `nrz08-asp`, number 1;
 * `ks-000` → prefix `ks`, number 0.
 */
export function splitCompoundGgId(rawId: string): {
  prefix: string;
  number: number;
} | null {
  const m = /^(.+?)-(\d+)$/i.exec(rawId.trim());
  if (!m) return null;
  return { prefix: m[1]!.toLowerCase(), number: Number(m[2]) };
}

function parseClassic(html: string): GgCard[] {
  const seen = new Set<string>();
  const cards: GgCard[] = [];
  for (const match of html.matchAll(CLASSIC_HREF)) {
    const [, set, prefix, number, slug] = match;
    const key = `${prefix}${number}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({
      prefix: prefix!.toLowerCase(),
      number: Number(number),
      set: set!,
      slug: slug!,
      rawId: `${prefix}${number}`.toLowerCase(),
      line: "classic-ccg",
    });
  }
  return cards;
}

function parseCompound(html: string, line: "kayou" | "mythos"): GgCard[] {
  const seen = new Set<string>();
  const cards: GgCard[] = [];
  for (const match of html.matchAll(COMPOUND_CARD_HREF)) {
    const [, lineHit, pathSlug] = match;
    if (lineHit?.toLowerCase() !== line) continue;
    // `nrz08-asp-001-naruto-uzumaki` → rawId `nrz08-asp-001`, slug `naruto-uzumaki`
    const parts = /^(.+-\d+)-([a-z0-9-]+)$/i.exec(pathSlug!);
    if (!parts) continue;
    const rawId = parts[1]!.toLowerCase();
    const slug = parts[2]!.toLowerCase();
    if (seen.has(rawId)) continue;
    seen.add(rawId);
    const split = splitCompoundGgId(rawId);
    if (!split) continue;
    cards.push({
      prefix: split.prefix,
      number: split.number,
      set: line,
      slug,
      rawId,
      line,
    });
  }
  return cards;
}

export function parseGgCardIndex(
  html: string,
  line: GgArchiveLine = "classic-ccg",
): GgCard[] {
  if (line === "classic-ccg") return parseClassic(html);
  return parseCompound(html, line);
}

/** `the-path-to-hokage` → `The Path To Hokage`. */
export function ggSetLabel(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** `naruto-uzumaki` → `Naruto Uzumaki`. */
export function ggCardName(slug: string): string {
  return ggSetLabel(slug);
}

export function ggCardsMissingFrom(
  cards: readonly GgCard[],
  held: ReadonlySet<string>,
): GgCard[] {
  return cards.filter((card) => !held.has(`${card.prefix}${card.number}`));
}

export function ggArchiveIndexUrl(line: GgArchiveLine): string {
  return `https://narutocardgame.gg/archive/${line}/cards`;
}

export function ggArchivePricesUrl(line: GgArchiveLine): string {
  return `https://narutocardgame.gg/archive/${line}/prices`;
}

export function ggClassicImageUrl(card: GgCard): string {
  return `https://narutocardgame.gg/images/classic/${card.prefix}${String(card.number).padStart(3, "0")}.jpg`;
}
