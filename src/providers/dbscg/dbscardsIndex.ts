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
 * The first version of this read their schema.org `ItemList`, which was a
 * mistake worth recording: **a list page renders 30 cards and publishes only 15
 * of them in its `ItemList`**. The index was silently half the catalogue —
 * 3884 French entries where the markup holds 7765 — and cards that were simply
 * in the unpublished half looked like cards the site did not carry, which is
 * how three real cards got reported as missing.
 *
 * The tiles are the whole source now. The `ItemList` was kept for a while as a
 * supplement, on the theory that it named a card's *representative* image; then
 * it was measured, and on a full page all fifteen of its images are byte-equal
 * to a face the tile already carries, with no slug of its own. It added
 * nothing, so it is gone. Reading tiles costs no extra request and yields, per
 * card, the real page URL, the rarity-qualified code, the price with its
 * thirty-day move, and both face URLs — see `dbscardsTile`.
 */
import {
  dbscardsBareSlug,
  dbscardsSlugToPrintRef,
  parseDbscardsTiles,
  type DbscardsTile,
} from "./dbscardsTile";

export { dbscardsSlugToPrintRef } from "./dbscardsTile";

/**
 * One card as their list renders it.
 *
 * A tile, and nothing else. `image` is only there to read the files crawled
 * before the tiles were parsed, where it was the sole URL an entry carried; new
 * crawls do not write it, because it merely repeated `imageFront`.
 */
export type DbscardsIndexEntry = DbscardsTile & {
  /**
   * @deprecated Legacy entries only. A Leader's is its `-back`, so it has to be
   * told apart by its filename suffix — where `imageFront` / `imageBack` name
   * the sides outright.
   */
  image?: string;
};

/**
 * Entries from one list page.
 *
 * Tolerant on purpose: a page that carries no tiles yields nothing rather than
 * throwing — the crawl walks hundreds of pages and one oddity must not lose
 * the rest.
 */
export function parseDbscardsListPage(html: string): DbscardsIndexEntry[] {
  return parseDbscardsTiles(html);
}

/**
 * Their per-locale list pages.
 *
 * `/cards` alone is the French list too — same pages — but the named path says
 * which locale it is instead of relying on the site's default. The two
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
    const ref = entry.ref ?? dbscardsSlugToPrintRef(entry.slug);
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
      dbscardsBareSlug(entry.slug).startsWith(`${ref.toLowerCase()}-${wanted}-`),
    );
    if (exact) return exact;
  }
  return bucket[0]!;
}
