/**
 * Ensure a *cards.fr `/cards` list dump exists (or refresh) for prices / faces.
 */
import {
  scrapeDbscardsIndex,
  type ScrapeDbscardsIndexResult,
} from "@/providers/shared/tcgcards/scrapeList";
import type { DbscardsSite } from "@/providers/shared/tcgcards/list";

export async function ensureCardsFrListDump(opts: {
  packId: string;
  site: DbscardsSite;
  indexPath: string;
  force?: boolean;
  maxPages?: number;
  delayMs?: number;
  label?: string;
}): Promise<ScrapeDbscardsIndexResult> {
  const label = opts.label ?? opts.site.id;
  return scrapeDbscardsIndex({
    packId: opts.packId,
    lang: "fr",
    site: opts.site,
    indexPath: opts.indexPath,
    maxPages: opts.maxPages ?? 800,
    delayMs: opts.delayMs ?? 300,
    onProgress: (page, total) => {
      if (page === 1 || page % 25 === 0) {
        console.log(`   ${label} list — page ${page} (${total} tuiles)`);
      }
    },
  });
}
