/**
 * Everything one dbscards.fr card page publishes.
 *
 * The list pages gave us a card's real URL and image — see `dbscardsIndex`.
 * The card page itself carries far more, and we are already paying the request
 * to reach it: rarity-qualified code, release date, colours, the full rules
 * text, the market price with a thirty-day history, and the sibling versions
 * *with their own real image URLs, per language*. That last one matters beyond
 * curiosity: the English list covers 1315 codes where the French covers 3389,
 * and a French page links its English siblings.
 *
 * This parser deliberately keeps more than the app currently displays. Deciding
 * later what to use costs nothing; re-crawling 5800 pages of a host that
 * tarpits under load costs an evening. So the captioned tables are read as
 * label→value pairs rather than a fixed field list — a card type we have never
 * seen still lands whole, instead of being silently dropped for having the
 * wrong shape.
 */
import { decode } from "html-entities";

import { dbscardsSlugToPrintRef } from "./dbscardsIndex";
import {
  parseDbscardsTiles,
  parseTilePrice,
  type DbscardsTile,
} from "./dbscardsTile";

/** A label and the values under it, with whatever they linked to. */
export type DbscardsField = {
  label: string;
  values: string[];
  /** Hrefs behind the values — they carry the site's own ids (`?color=1`). */
  links: string[];
};

/** One captioned table: `Informations générales`, `Face Avant`, `Face Arrière`. */
export type DbscardsTable = {
  caption: string;
  fields: DbscardsField[];
};

/** One rules-text block, one per side of the card. */
export type DbscardsDescription = {
  /** `LEADER : FACE`, `LEADER : DOS`, or empty on a single-sided card. */
  title: string;
  /** The side is the awakened one — the page marks it with its own icon. */
  awakened: boolean;
  /** The language of the rules text, which is the card's, not the site's. */
  lang: string | null;
  /** Plain text, chips included, newlines where the markup broke lines. */
  text: string;
  /** The keyword chips alone: `Activation : Principale`, `Une fois par tour`. */
  keywords: string[];
  /**
   * The block verbatim.
   *
   * Plain text drops the energy icons — `<span class="ball redBall">` is empty
   * markup whose meaning is entirely in its class, and it sits *between* words
   * in a cost line. Keeping the markup means a later reader can recover them
   * without re-crawling, which is the whole point of this pass.
   */
  html: string;
};

/** The `Product` offer, when the page carries one. */
export type DbscardsOffer = {
  price: number | null;
  priceText: string | null;
  currency: string | null;
  url: string | null;
  validUntil: string | null;
  availability: string | null;
  condition: string | null;
};

/** The thirty-day chart, one series per marketplace. */
export type DbscardsPriceHistory = {
  /** Day labels as printed, `17/07` … `15/08`. */
  labels: string[];
  series: Array<{
    name: string;
    /** One entry per label; `null` where the marketplace had no listing. */
    points: Array<number | null>;
  }>;
};

export type DbscardsImage = {
  url: string;
  lang: string | null;
  name: string | null;
  /** Carries the full set name: `édition BT31 - Ultra Bout - …`. */
  description: string | null;
  representative: boolean;
};

export type DbscardsCharacter = {
  name: string;
  url: string | null;
  image: string | null;
};

export type DbscardsCardPage = {
  slug: string;
  /** Locale of the list this slug came from, not of the card's own text. */
  lang: string;
  url: string | null;
  /** `bt31-001` */
  ref: string | null;
  /** `BT31-001-UC` — the code *with* its rarity, which the slug also encodes. */
  sku: string | null;
  /** Printed name; `front // awakened` on a Leader. */
  name: string | null;
  tables: DbscardsTable[];
  descriptions: DbscardsDescription[];
  /** `Synergies` → […], `Thématiques` → […]. */
  tags: Array<{ group: string; labels: string[] }>;
  /** Sibling printings, read with the same tile parser the list pages use. */
  versions: DbscardsTile[];
  offer: DbscardsOffer | null;
  priceHistory: DbscardsPriceHistory | null;
  images: DbscardsImage[];
  characters: DbscardsCharacter[];
  /** The `Product` block verbatim, so a field we did not model is not lost. */
  productJsonLd: unknown;
};

const LD_JSON = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
const TABLE = /<table[^>]*>([\s\S]*?)<\/table>/gi;
const CAPTION = /<caption[^>]*>([\s\S]*?)<\/caption>/i;
const ROW = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
const LABEL = /<th[^>]*>([\s\S]*?)<\/th>/i;
const VALUE = /<td[^>]*>([\s\S]*?)<\/td>/i;
const HREF = /href="([^"]+)"/gi;

/**
 * Tags mean a line break, not a word boundary — `<br/>` separates values.
 *
 * Runs of spaces collapse: the markup is indented, so a naive strip leaves
 * lines made of nothing but the template's whitespace.
 */
function textOf(html: string): string {
  const broken = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, "\n");
  return decode(broken.replace(/<[^>]+>/g, ""))
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function lines(html: string): string[] {
  return textOf(html)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  for (const match of html.matchAll(LD_JSON)) {
    try {
      out.push(JSON.parse(match[1] ?? ""));
    } catch {
      // A malformed block loses itself, never the rest of the page.
    }
  }
  return out;
}

function parseTables(html: string): DbscardsTable[] {
  const out: DbscardsTable[] = [];
  for (const table of html.matchAll(TABLE)) {
    const body = table[1] ?? "";
    const caption = CAPTION.exec(body);
    if (!caption) continue;
    const fields: DbscardsField[] = [];
    for (const row of body.matchAll(ROW)) {
      const cells = row[1] ?? "";
      const label = LABEL.exec(cells);
      const value = VALUE.exec(cells);
      if (!label || !value) continue;
      const links = [...(value[1] ?? "").matchAll(HREF)].map((m) => m[1]!);
      fields.push({
        label: textOf(label[1] ?? ""),
        values: lines(value[1] ?? ""),
        links,
      });
    }
    if (fields.length > 0) {
      out.push({ caption: textOf(caption[1] ?? ""), fields });
    }
  }
  return out;
}

const DESCRIPTION_REGION =
  /<div[^>]*class="[^"]*item-description-inner[^"]*"[^>]*>([\s\S]*?)(?=<h2|<\/body>|$)/i;
const DESCRIPTION_TITLE =
  /<span[^>]*class="[^"]*description-title[^"]*"[^>]*>([\s\S]*?)<\/span>/i;
const DESCRIPTION_BODY = /<div\s+lang="([a-z]{2})"[^>]*>([\s\S]*?)<\/div>/gi;
const SKILL_CHIP = /<span[^>]*class="[^"]*\bskill\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;

/**
 * The rules text, split by side.
 *
 * The text itself is in `<div lang="fr">`, and taking only those is what makes
 * this reliable: bounding the outer block instead swallowed the tags section
 * that follows it, turning a 380-character ability into 1900 characters of
 * whitespace and stray headings. The `<hr/>` separates the sides, each titled
 * `LEADER : FACE` / `LEADER : DOS`; a single-sided card has one part, untitled.
 *
 * Chips stay inside the text — `Une fois par tour` reads as part of the
 * sentence — and are listed separately as well.
 */
function parseDescriptions(html: string): DbscardsDescription[] {
  const region = DESCRIPTION_REGION.exec(html);
  if (!region) return [];
  const out: DbscardsDescription[] = [];
  for (const part of (region[1] ?? "").split(/<hr\s*\/?>/i)) {
    const bodies = [...part.matchAll(DESCRIPTION_BODY)];
    if (bodies.length === 0) continue;
    const body = bodies.map((m) => m[2] ?? "").join("<br>");
    const titleMatch = DESCRIPTION_TITLE.exec(part);
    const keywords = [...body.matchAll(SKILL_CHIP)]
      .map((m) => textOf(m[1] ?? ""))
      .filter(Boolean);
    const text = textOf(body);
    if (!text && keywords.length === 0) continue;
    out.push({
      title: titleMatch ? textOf(titleMatch[1] ?? "") : "",
      awakened: /description-icon-awake/i.test(part),
      lang: bodies[0]![1]?.toLowerCase() ?? null,
      text,
      keywords,
      html: body.trim(),
    });
  }
  return out;
}

const TAGS_SECTION = /Tags\s+associés[\s\S]*?(?=<h2|<\/body>|$)/i;
const TAG_GROUP = /<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|$)/gi;
const TAG_ITEM = /<(?:a|span|li)[^>]*class="[^"]*\btag\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|span|li)>/gi;

function parseTags(html: string): Array<{ group: string; labels: string[] }> {
  const section = TAGS_SECTION.exec(html);
  if (!section) return [];
  const out: Array<{ group: string; labels: string[] }> = [];
  for (const group of section[0].matchAll(TAG_GROUP)) {
    const name = textOf(group[1] ?? "");
    if (!name) continue;
    const body = group[2] ?? "";
    let labels = [...body.matchAll(TAG_ITEM)].map((m) => textOf(m[1] ?? ""));
    if (labels.length === 0) labels = lines(body);
    labels = labels.filter(Boolean);
    if (labels.length > 0) out.push({ group: name, labels });
  }
  return out;
}

const CHART_VALUE = /chart-view-value="([^"]+)"/i;

function parsePriceHistory(html: string): DbscardsPriceHistory | null {
  const match = CHART_VALUE.exec(html);
  if (!match) return null;
  let chart: {
    data?: {
      labels?: unknown[];
      datasets?: Array<{ label?: string; data?: unknown[] }>;
    };
  };
  try {
    chart = JSON.parse(decode(match[1] ?? ""));
  } catch {
    return null;
  }
  const labels = (chart?.data?.labels ?? []).map((l) => String(l));
  const series = (chart?.data?.datasets ?? []).map((set) => ({
    name: set?.label ?? "",
    points: (set?.data ?? []).map((point) => {
      if (point == null) return null;
      const value = Number.parseFloat(String(point).replace(",", "."));
      return Number.isFinite(value) ? value : null;
    }),
  }));
  if (labels.length === 0 && series.length === 0) return null;
  return { labels, series };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseOffer(product: Record<string, unknown> | null): DbscardsOffer | null {
  const offer = asRecord(product?.offers);
  if (!offer) return null;
  const priceText = str(offer.price) ?? (typeof offer.price === "number" ? String(offer.price) : null);
  const parsed = parseTilePrice(priceText);
  return {
    price: parsed?.value ?? null,
    priceText,
    currency: str(offer.priceCurrency) ?? parsed?.currency ?? null,
    url: str(offer.url),
    validUntil: str(offer.priceValidUntil),
    availability: str(offer.availability),
    condition: str(offer.itemCondition),
  };
}

function parseImages(product: Record<string, unknown> | null): DbscardsImage[] {
  const raw = product?.image;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: DbscardsImage[] = [];
  for (const entry of list) {
    if (typeof entry === "string") {
      out.push({
        url: entry,
        lang: null,
        name: null,
        description: null,
        representative: false,
      });
      continue;
    }
    const image = asRecord(entry);
    const url = str(image?.contentUrl) ?? str(image?.url);
    if (!url) continue;
    out.push({
      url,
      lang: str(image?.inLanguage),
      name: str(image?.name),
      description: str(image?.description),
      representative: image?.representativeOfPage === true,
    });
  }
  return out;
}

function parseCharacters(
  product: Record<string, unknown> | null,
): DbscardsCharacter[] {
  const raw = product?.character;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: DbscardsCharacter[] = [];
  for (const entry of list) {
    const person = asRecord(entry);
    const name = str(person?.name);
    if (!name) continue;
    out.push({
      name,
      url: str(person?.url),
      image: str(person?.image),
    });
  }
  return out;
}

/**
 * The card's rarity-qualified code, from the page or failing that the slug.
 *
 * English pages carry no `Product` block at all, so the slug is the only
 * source there — and it holds the same thing: `en-bt25-009-sr-…` → `BT25-009-SR`.
 */
function skuFrom(
  product: Record<string, unknown> | null,
  slug: string,
): string | null {
  const fromLd = str(product?.sku);
  if (fromLd) return fromLd.toUpperCase();
  const bare = slug.replace(/^(?:en|fr)-(?=[a-z]+\d)/i, "");
  const match = /^([a-z0-9]+)-(\d+[a-z]*)-([a-z]+)-/i.exec(bare);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`.toUpperCase();
}

export function parseDbscardsCardPage(
  html: string,
  meta: { slug: string; lang: string; url?: string | null },
): DbscardsCardPage {
  const blocks = jsonLdBlocks(html);
  const product =
    blocks
      .map(asRecord)
      .find((block) => block?.["@type"] === "Product") ?? null;

  return {
    slug: meta.slug,
    lang: meta.lang.toLowerCase(),
    url: meta.url ?? null,
    ref: dbscardsSlugToPrintRef(meta.slug),
    sku: skuFrom(product, meta.slug),
    name: str(product?.name),
    tables: parseTables(html),
    descriptions: parseDescriptions(html),
    tags: parseTags(html),
    versions: parseDbscardsTiles(html),
    offer: parseOffer(product),
    priceHistory: parsePriceHistory(html),
    images: parseImages(product),
    characters: parseCharacters(product),
    productJsonLd: product,
  };
}
