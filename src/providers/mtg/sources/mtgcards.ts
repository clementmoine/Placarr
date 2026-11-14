/**
 * mtgcards.fr — TCG Cards family row for the Magic pack.
 *
 * Card faces stay on Scryfall; sealed SKUs + optional FR shop faces come from
 * this host (same Symfony stack as opecards / lorcards).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  scrapeTcgCardsProducts,
  type ScrapeDbscardsProductsResult,
} from "@/providers/shared/tcgcards/scrapeProducts";
import {
  tcgCardsDetailCategories,
  tcgCardsListingCategories,
  tcgCardsSite,
} from "@/providers/shared/tcgcards/sites";

export const MTGCARDS_SITE = tcgCardsSite("mtgcards");
export const MTGCARDS_LISTING_CATEGORIES =
  tcgCardsListingCategories("mtgcards");
export const MTGCARDS_DETAIL_CATEGORIES = tcgCardsDetailCategories("mtgcards");
export const MTGCARDS_STAGING_FOLDER = MTGCARDS_SITE.stagingFolder;

const MTG_PRODUCTS_CONTENTS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "curated",
  "products-contents.json",
);

export async function scrapeMtgcardsProducts(opts: {
  force?: boolean;
  offline?: boolean;
  delayMs?: number;
  limit?: number;
  onProgress?: (message: string) => void;
}): Promise<ScrapeDbscardsProductsResult> {
  return scrapeTcgCardsProducts("mtgcards", {
    ...opts,
    curatedContentsPath: MTG_PRODUCTS_CONTENTS,
  });
}
