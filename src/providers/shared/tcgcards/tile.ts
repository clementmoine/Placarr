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

  `jp` is Fusion World's, whose Japanese slugs read `jp-fb09-001-l-gogeta-br`.
*/
const LOCALE_PREFIX = /^(?:en|fr|jp|ja)-(?=[a-z]+\d|[a-z]+-\d)/i;

export function dbscardsSlugToPrintRef(slug: string): string | null {
  const trimmed = decodeURIComponent(slug.trim());
  /*
    Lorcana: `223-204-fr-12-jessie-…` → set 12, number 223 → `12-223`.
  */
  const lorcana =
    /^(\d+)-\d+-(?:fr|en|de|it|es|pt)-(\d+)-/i.exec(trimmed);
  if (lorcana) {
    return `${lorcana[2]!.toLowerCase()}-${lorcana[1]!.toLowerCase()}`;
  }
  /*
    Pokémon *cards.fr puts the locale **between** set and number
    (`asc-fr-276-pikachu`). Bandai puts it at the front (`en-bt25-009-…`).
    Trying the mid-locale shape first keeps both families honest.
  */
  const pokeMidLocale =
    /^([a-z0-9]+)-(?:fr|en|de|it|es|pt|ja|jp|ptbr|pt-br)-(\d+[a-z]*)-/i.exec(
      trimmed,
    );
  if (pokeMidLocale) {
    return `${pokeMidLocale[1]!.toLowerCase()}-${pokeMidLocale[2]!.toLowerCase()}`;
  }
  /*
    Yu-Gi-Oh: `cyac-fr042-str-…` → `cyac-fr042` (set + locale+number).
  */
  const ygo =
    /^([a-z0-9]+)-((?:fr|en|de|it)\d{3,})(?:-|$)/i.exec(trimmed);
  if (ygo) {
    return `${ygo[1]!.toLowerCase()}-${ygo[2]!.toLowerCase()}`;
  }
  /*
    Named Lorcana slugs without the numeric set (`les-terres-d'encres-218-…`)
    fall through — the title line (`218/204 • FR • 3`) carries the set.
    Bare `set-number` only when the set looks like a code (digit, or ≤3 letters
    like Bandai `p-082`), not a title word (`disney-100-18-p1-…`).
  */
  const bare = trimmed.replace(LOCALE_PREFIX, "");
  const match = /^([a-z0-9]+)-(\d+[a-z]*)-/i.exec(bare);
  if (!match) return null;
  const set = match[1]!.toLowerCase();
  if (!/\d/.test(set) && set.length > 3) return null;
  return `${set}-${match[2]!.toLowerCase()}`;
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
  /*
    Bandai: `BT31-001-UC` (rarity suffix). Pokémon / Lorcana title: `ASC-276`
    / `3-218` (no rarity segment). YGO: `CYAC-FR042` (lang glued to number).
  */
  const sku = tile.sku ?? "";
  const fromSku = /^([a-z0-9]+)-(\d+[a-z]*)(?:-|$)/i.exec(sku);
  if (fromSku) {
    return `${fromSku[1]!.toLowerCase()}-${fromSku[2]!.toLowerCase()}`;
  }
  const fromYgoSku =
    /^([a-z0-9]+)-((?:fr|en|de|it|es|pt)\d+[a-z]*)(?:-|$)/i.exec(sku);
  if (fromYgoSku) {
    return `${fromYgoSku[1]!.toLowerCase()}-${fromYgoSku[2]!.toLowerCase()}`;
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
/** Bandai rarity-qualified: `BT31-001-UC`. */
const SKU_FROM_TITLE = /title="[^"]*?\b([A-Z0-9]+-\d+[A-Z]*-[A-Z]+)\b/;
/**
 * Pokémon printed collector line in the same title attr:
 * `ASC - 276/217 Pikachu` → sku `ASC-276`.
 */
const POKE_SKU_FROM_TITLE =
  /title="[^"]*?\b([A-Z0-9]+)\s*-\s*(\d+[A-Za-z]*)\/\d+\b/;
/**
 * Lorcana: `218/204 • FR • 3 Balthazar…` → sku `3-218`.
 */
const LORCANA_SKU_FROM_TITLE =
  /title="[^"]*?(\d+)\/\d+\s*[•·]\s*[A-Za-z]{2}\s*[•·]\s*(\d+)\b/;
/**
 * Yu-Gi-Oh: `CYAC-FR042 Luluwalilith…` → sku `CYAC-FR042`.
 */
const YGO_SKU_FROM_TITLE =
  /title="[^"]*?\b([A-Z0-9]{2,}-[A-Z]{2}\d{3,}[A-Z]*)\b/;
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
const PRICE =
  /<span[^>]*class="[^"]*item-price(?=[\s"])[^"]*"[^>]*>([\s\S]*?)<\/span>/i;
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

function sideImages(html: string): {
  front: string | null;
  back: string | null;
} {
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
  const rawSlug = SLUG.exec(body)?.[1];
  if (!rawSlug) return null;
  let slug = rawSlug;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    /* keep raw */
  }
  const bandaiSku = SKU_FROM_TITLE.exec(body)?.[1]?.toUpperCase() ?? null;
  const pokeTitle = POKE_SKU_FROM_TITLE.exec(body);
  const pokeSku = pokeTitle
    ? `${pokeTitle[1]!.toUpperCase()}-${pokeTitle[2]!.toUpperCase()}`
    : null;
  /*
    pkmcards.fr list titles often omit `ASC - 276/217` — only the slug carries
    the collector code (`pbl-fr-001-…`). Without a slug fallback every Pokémon
    tile landed with sku/ref null even though the face URL was fine.
  */
  const pokeSlug =
    /^([a-z0-9]+)-(?:fr|en|de|it|es|pt|ja|jp|ptbr|pt-br)-(\d+[a-z]*)-/i.exec(
      slug,
    );
  const pokeSkuFromSlug = pokeSlug
    ? `${pokeSlug[1]!.toUpperCase()}-${pokeSlug[2]!.toUpperCase()}`
    : null;
  const lorcanaTitle = LORCANA_SKU_FROM_TITLE.exec(body);
  const lorcanaSku = lorcanaTitle
    ? `${lorcanaTitle[2]!}-${lorcanaTitle[1]!}`
    : null;
  const ygoSku = YGO_SKU_FROM_TITLE.exec(body)?.[1]?.toUpperCase() ?? null;
  const sku =
    bandaiSku ?? pokeSku ?? pokeSkuFromSlug ?? lorcanaSku ?? ygoSku;
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
