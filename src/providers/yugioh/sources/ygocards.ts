/**
 * ygocards.fr — TCG Cards family row for the Yu-Gi-Oh! pack.
 *
 * Card faces stay on YGOPRODeck / ScanFlip; sealed SKUs + optional FR shop
 * faces come from this host (same Symfony stack as opecards / lorcards).
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

export const YGOCARDS_SITE = tcgCardsSite("ygocards");
export const YGOCARDS_LISTING_CATEGORIES =
  tcgCardsListingCategories("ygocards");
export const YGOCARDS_DETAIL_CATEGORIES = tcgCardsDetailCategories("ygocards");
export const YGOCARDS_STAGING_FOLDER = YGOCARDS_SITE.stagingFolder;

const YUGIOH_PRODUCTS_CONTENTS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "curated",
  "products-contents.json",
);

export async function scrapeYgocardsProducts(opts: {
  force?: boolean;
  offline?: boolean;
  delayMs?: number;
  limit?: number;
  onProgress?: (message: string) => void;
}): Promise<ScrapeDbscardsProductsResult> {
  return scrapeTcgCardsProducts("ygocards", {
    ...opts,
    curatedContentsPath: YUGIOH_PRODUCTS_CONTENTS,
  });
}
