/**
 * lorcards.fr — TCG Cards family row for the Lorcana pack.
 *
 * Faces stay on the official dump. Products go through `scrapeTcgCardsProducts`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  scrapeTcgCardsProducts,
  type ScrapeDbscardsProductsResult,
} from "@/providers/shared/dbscards/scrapeProducts";
import {
  tcgCardsDetailCategories,
  tcgCardsListingCategories,
  tcgCardsSite,
} from "@/providers/shared/dbscards/sites";
import { installProviderProductsContents } from "@/providers/shared/sealedProducts/curatedContents";

export const LORCARDS_SITE = tcgCardsSite("lorcards");
export const LORCARDS_LISTING_CATEGORIES =
  tcgCardsListingCategories("lorcards");
export const LORCARDS_DETAIL_CATEGORIES = tcgCardsDetailCategories("lorcards");
export const LORCARDS_STAGING_FOLDER = LORCARDS_SITE.stagingFolder;

const LORCANA_PRODUCTS_CONTENTS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "curated",
  "products-contents.json",
);

export async function scrapeLorcardsProducts(opts: {
  force?: boolean;
  offline?: boolean;
  delayMs?: number;
  limit?: number;
  onProgress?: (message: string) => void;
}): Promise<ScrapeDbscardsProductsResult> {
  installProviderProductsContents("lorcana", LORCANA_PRODUCTS_CONTENTS);
  return scrapeTcgCardsProducts("lorcards", opts);
}
