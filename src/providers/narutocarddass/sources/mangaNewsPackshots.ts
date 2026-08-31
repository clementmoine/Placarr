/**
 * Manga-News « Deck Série N » covers are FR booster packshots.
 * Source of truth: `curated/sources/manga-news-packshots.json`.
 */
import ledger from "../curated/sources/manga-news-packshots.json";

export type MangaNewsPackshot = (typeof ledger.products)[number];

/** Listing thumbs: `.{name}_medium.jpg` → full `{name}.jpg`. */
export function mangaNewsFullGoodieUrl(url: string): string {
  return url.replace(/\/\.([^/]+)_medium\.(jpe?g|webp)$/i, "/$1.$2");
}

export function mangaNewsPackshotLedger() {
  return ledger;
}

export function mangaNewsIngestPackshots(): MangaNewsPackshot[] {
  return ledger.products.filter((row) => row.ingest);
}
