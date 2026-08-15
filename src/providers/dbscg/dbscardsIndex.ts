/**
 * The real dbscards.fr card list, read from their own pages.
 *
 * Every French face URL used to be *constructed*: a slug built from the printed
 * name, tried against two CDN layouts and two apostrophe spellings, four
 * requests per card of which at least one was always wrong. It mostly worked —
 * measured 14/14 on a sample — but "mostly" is the problem: a miss is
 * indistinguishable from a card they simply do not carry, and a slow host turns
 * both into a timeout.
 *
 * Their `/cards` pages carry a schema.org `ItemList` naming, per card, its page
 * URL, its printed name and **its image URL**. That is the mapping we were
 * guessing at, published in the markup search engines read. Crawled once, it
 * removes the guess entirely: no slug rules, no layout probing, no wasted
 * request.
 *
 * A Leader's entry points at its `-back` image, and its `name` carries both
 * sides separated by `//` — the front is derived from the same slug.
 */

/** One card as their list publishes it. */
export type DbscardsIndexEntry = {
  /** `bt31-001-uc-gogeta-ss-fusion-de-renversement-de-situation` */
  slug: string;
  /** Printed name; `front // awakened` on a Leader. */
  name: string;
  /** The image their own page points at — may be the `-back` of a Leader. */
  image: string;
};

const LD_JSON = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;

/**
 * Entries from one list page.
 *
 * Tolerant on purpose: a page that carries no `ItemList`, or a malformed
 * block, yields nothing rather than throwing — the crawl walks hundreds of
 * pages and one oddity must not lose the rest.
 */
export function parseDbscardsListPage(html: string): DbscardsIndexEntry[] {
  const out: DbscardsIndexEntry[] = [];
  for (const match of html.matchAll(LD_JSON)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1] ?? "");
    } catch {
      continue;
    }
    const list = parsed as {
      "@type"?: string;
      itemListElement?: Array<{ url?: string; name?: string; image?: string }>;
    };
    if (list?.["@type"] !== "ItemList") continue;
    for (const item of list.itemListElement ?? []) {
      const url = item?.url?.trim();
      const image = item?.image?.trim();
      if (!url || !image) continue;
      const slug = url.split("/cards/").pop()?.trim();
      if (!slug) continue;
      out.push({ slug, name: item?.name?.trim() ?? "", image });
    }
  }
  return out;
}

/**
 * `bt31-001-uc-gogeta-…` → `bt31-001`.
 *
 * The rarity letters sit between the number and the name, so the collector
 * part is the first two segments — after an optional locale prefix. Their
 * English slugs carry one (`en-bt25-009-sr-…`) and the French ones do not,
 * which silently yielded zero references for the whole English list.
 */
const LOCALE_PREFIX = /^(?:en|fr)-(?=[a-z]+\d)/i;

export function dbscardsSlugToPrintRef(slug: string): string | null {
  const bare = slug.trim().replace(LOCALE_PREFIX, "");
  const match = /^([a-z0-9]+)-(\d+[a-z]*)-/i.exec(bare);
  if (!match) return null;
  return `${match[1]!.toLowerCase()}-${match[2]!.toLowerCase()}`;
}

/**
 * Their per-locale list pages.
 *
 * `/cards` alone is the French list too — same 259 pages — but the named path
 * says which locale it is instead of relying on the site's default. The two
 * languages then read the same way, which is the point: `/cards/N` and
 * `/cards/liste-cartes-anglaises/N` would have been the same call spelled two
 * different ways.
 */
const DBSCARDS_LIST_PATH: Record<string, string> = {
  fr: "/cards/liste-cartes-francaises",
  en: "/cards/liste-cartes-anglaises",
};

export function dbscardsListPageUrl(page: number, lang = "fr"): string {
  const base = DBSCARDS_LIST_PATH[lang.toLowerCase()];
  if (!base) throw new Error(`dbscards: no list page for locale ${lang}`);
  const suffix = page <= 1 ? "" : `/${page}`;
  return `https://www.dbscards.fr${base}${suffix}`;
}

/** Locales their site publishes a list for. */
export const DBSCARDS_LIST_LANGS = Object.keys(DBSCARDS_LIST_PATH);

/** The front image of a Leader, whose list entry points at its awakened side. */
export function dbscardsFrontFromBack(image: string): string {
  return image.replace(/-back\.webp$/i, ".webp");
}

export function dbscardsIsBackImage(image: string): boolean {
  return /-back\.webp$/i.test(image);
}

/**
 * Real URLs by collector reference, read once from the crawled list.
 *
 * A card can appear several times — one entry per rarity — so the value is a
 * list and the caller narrows by rarity when it can. Missing the file is not
 * an error: the pass falls back to constructing URLs, which is what it did
 * before this index existed.
 */
export type DbscardsIndex = Map<string, DbscardsIndexEntry[]>;

export function buildDbscardsIndex(
  entries: readonly DbscardsIndexEntry[],
): DbscardsIndex {
  const index: DbscardsIndex = new Map();
  for (const entry of entries) {
    const ref = dbscardsSlugToPrintRef(entry.slug);
    if (!ref) continue;
    const bucket = index.get(ref);
    if (bucket) bucket.push(entry);
    else index.set(ref, [entry]);
  }
  return index;
}

/**
 * The entry for one print, narrowed by rarity when the code has several.
 *
 * Rarity is the only thing telling `bt31-001-uc` from `bt31-001-slr`, and both
 * are real prints with different art. Without a match the first entry is
 * returned rather than none: a face from the right card beats no face.
 */
export function lookupDbscardsEntry(
  index: DbscardsIndex,
  ref: string,
  rarityCode?: string | null,
): DbscardsIndexEntry | null {
  const bucket = index.get(ref.toLowerCase());
  if (!bucket || bucket.length === 0) return null;
  const wanted = rarityCode?.trim().toLowerCase();
  if (wanted) {
    const exact = bucket.find((entry) =>
      entry.slug
        .replace(LOCALE_PREFIX, "")
        .startsWith(`${ref.toLowerCase()}-${wanted}-`),
    );
    if (exact) return exact;
  }
  return bucket[0]!;
}
