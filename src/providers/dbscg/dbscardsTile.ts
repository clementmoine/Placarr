/**
 * The card tile dbscards.fr repeats everywhere it shows a card.
 *
 * The same component renders a list page, a set page and the "other versions"
 * carousel on a card page, so one parser serves all three. Reading it beats
 * reading the page's `ItemList` for two reasons, both measured:
 *
 * 1. **The JSON-LD is half-blind.** A list page renders 30 tiles and publishes
 *    only 15 of them in its `ItemList`. The index built from the markup search
 *    engines read was therefore missing every other card — 3884 French entries
 *    where the tiles hold roughly 7770.
 * 2. **The tile carries more.** Price and its thirty-day move, the
 *    rarity-qualified code, and *both* face URLs — with `item-image-recto` and
 *    `-verso` naming the sides outright, instead of the `-back.webp` suffix
 *    guess made elsewhere.
 *
 * The images live in `data-src`, not `src`: `src` is a shared placeholder card
 * back for lazy loading. Reading `src` collects the same generic file a few
 * thousand times.
 */
import { decode } from "html-entities";

/**
 * `bt31-001-uc-gogeta-…` → `bt31-001`.
 *
 * The rarity letters sit between the number and the name, so the collector part
 * is the first two segments — after an optional locale prefix. Their English
 * slugs carry one (`en-bt25-009-sr-…`) and the French ones do not, which
 * silently yielded zero references for the whole English list.
 *
 * Lives here rather than with the index because every reader of their markup
 * needs it, and the index reads tiles rather than the other way round.
 */
/*
  The lookahead has to accept a set code with no digit in it. Written as
  `[a-z]+\d` it fitted `en-bt25-009` and missed `en-p-082`, so the prefix stayed
  on, the reference regex then read `en` as the set — and **555 English tiles,
  every promo, carried no reference at all**.
*/
const LOCALE_PREFIX = /^(?:en|fr)-(?=[a-z]+\d|[a-z]+-\d)/i;

export function dbscardsSlugToPrintRef(slug: string): string | null {
  const bare = slug.trim().replace(LOCALE_PREFIX, "");
  const match = /^([a-z0-9]+)-(\d+[a-z]*)-/i.exec(bare);
  if (!match) return null;
  return `${match[1]!.toLowerCase()}-${match[2]!.toLowerCase()}`;
}

/**
 * The collector reference of a tile, from its code rather than its slug.
 *
 * Their two spellings of a card disagree: the slug says `ex2-01` where the
 * title says `EX02-01-EX`, and the padded form is the printed one — the one
 * our catalogue uses. Reading the slug lost the whole EX02 set to a spelling
 * difference. The slug stays as the fallback for a tile whose title carries no
 * code.
 */
export function dbscardsPrintRef(tile: {
  sku?: string | null;
  slug: string;
}): string | null {
  const fromSku = /^([a-z0-9]+)-(\d+[a-z]*)-/i.exec(tile.sku ?? "");
  if (fromSku) {
    return `${fromSku[1]!.toLowerCase()}-${fromSku[2]!.toLowerCase()}`;
  }
  return dbscardsSlugToPrintRef(tile.slug);
}

/** The slug without its locale prefix, for matching rarity segments. */
export function dbscardsBareSlug(slug: string): string {
  return slug.trim().replace(LOCALE_PREFIX, "");
}

export type DbscardsTile = {
  /** The site's own numeric id for this printing. */
  itemId: string | null;
  /** `bt31-001-uc-gogeta-ss-fusion-de-renversement-de-situation` */
  slug: string;
  /** `bt31-001` */
  ref: string | null;
  /** `BT31-001-UC` — the code with its rarity. */
  sku: string | null;
  name: string;
  /** The card's own language, which the tile states; a French page lists English cards. */
  lang: string | null;
  /** As printed, e.g. `108.00€`. */
  priceText: string | null;
  price: number | null;
  currency: string | null;
  /** Thirty-day move as printed, e.g. `-1.99€`. */
  priceDeltaText: string | null;
  priceDelta: number | null;
  /** Real image URLs — the reason this parser exists. */
  imageFront: string | null;
  imageBack: string | null;
};

const TILE_SPLIT = /<div[^>]*\bdata-item="(\d+)"[^>]*>/gi;
const SLUG = /href="\/cards\/([^"#?]+)"[^>]*title="/i;
const SKU_FROM_TITLE = /title="[^"]*?\b([A-Z0-9]+-\d+[A-Z]*-[A-Z]+)\b/;
const NAME = /<h3[^>]*class="[^"]*item-name[^"]*"[^>]*>([\s\S]*?)<\/h3>/i;
const LANG = /\blang="([a-z]{2})"/i;
/**
 * `item-price` and not `item-price-difference`.
 *
 * `\bitem-price\b` matches both — the boundary between `price` and `-` is a
 * word boundary — so the thirty-day move was read as the price itself, and
 * every card whose price moved reported `-1.99€` instead of `108.00€`. The
 * class token has to end at whitespace or the closing quote.
 */
const PRICE = /<span[^>]*class="[^"]*item-price(?=[\s"])[^"]*"[^>]*>([\s\S]*?)<\/span>/i;
const DELTA =
  /<span[^>]*class="[^"]*item-price-difference[^"]*"[^>]*>([\s\S]*?)<\/span>/i;
const IMG = /<img[^>]*>/gi;
const DATA_SRC = /data-src="([^"]+)"/i;

/**
 * Where a tile stops.
 *
 * Tiles are split on the next `data-item`, which leaves the last one running to
 * the end of the chunk. Unbounded, it would absorb the price of whatever
 * section follows. These markers are what actually follows a tile grid.
 */
const TILE_END =
  /<div[^>]*class="[^"]*(?:swiper-pagination|section-header|pagination)[^"]*"|<\/section|<footer/i;

function textOf(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** `108.00€` → `{ value: 108, currency: "EUR" }`; a sign is kept. */
export function parseTilePrice(
  raw: string | null | undefined,
): { value: number; currency: string | null } | null {
  if (!raw) return null;
  const match = /(-?\d+(?:[.,]\d+)?)\s*(€|EUR|\$|USD|£|GBP)?/i.exec(raw);
  if (!match) return null;
  const value = Number.parseFloat(match[1]!.replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const symbol = match[2]?.toUpperCase() ?? null;
  const currency =
    symbol === "€"
      ? "EUR"
      : symbol === "$"
        ? "USD"
        : symbol === "£"
          ? "GBP"
          : symbol;
  return { value, currency };
}

function sideImages(html: string): { front: string | null; back: string | null } {
  let front: string | null = null;
  let back: string | null = null;
  for (const tag of html.matchAll(IMG)) {
    const raw = tag[0];
    const src = DATA_SRC.exec(raw)?.[1];
    if (!src) continue;
    if (/item-image-recto/i.test(raw)) front ??= decode(src);
    else if (/item-image-verso/i.test(raw)) back ??= decode(src);
  }
  return { front, back };
}

function parseTile(itemId: string, body: string): DbscardsTile | null {
  const slug = SLUG.exec(body)?.[1];
  if (!slug) return null;
  const sku = SKU_FROM_TITLE.exec(body)?.[1]?.toUpperCase() ?? null;
  const nameMatch = NAME.exec(body);
  const priceText = (() => {
    const match = PRICE.exec(body);
    return match ? textOf(match[1] ?? "") || null : null;
  })();
  const deltaText = (() => {
    const match = DELTA.exec(body);
    return match ? textOf(match[1] ?? "") || null : null;
  })();
  const price = parseTilePrice(priceText);
  const delta = parseTilePrice(deltaText);
  const sides = sideImages(body);
  return {
    itemId,
    slug,
    ref: dbscardsPrintRef({ sku, slug }),
    sku,
    name: nameMatch ? textOf(nameMatch[1] ?? "") : "",
    lang: LANG.exec(body)?.[1]?.toLowerCase() ?? null,
    priceText,
    price: price?.value ?? null,
    currency: price?.currency ?? null,
    priceDeltaText: deltaText,
    priceDelta: delta?.value ?? null,
    imageFront: sides.front,
    imageBack: sides.back,
  };
}

/**
 * Every card tile in a chunk of markup, in page order.
 *
 * Tolerant by design: a tile without a card link is skipped rather than
 * throwing, because one oddity must not cost the other twenty-nine.
 */
export function parseDbscardsTiles(html: string): DbscardsTile[] {
  const starts = [...html.matchAll(TILE_SPLIT)];
  const out: DbscardsTile[] = [];
  for (const [index, start] of starts.entries()) {
    const from = start.index! + start[0].length;
    const to = starts[index + 1]?.index ?? html.length;
    let body = html.slice(from, to);
    if (index === starts.length - 1) {
      const end = TILE_END.exec(body);
      if (end) body = body.slice(0, end.index);
    }
    const tile = parseTile(start[1]!, body);
    if (tile) out.push(tile);
  }
  return out;
}
