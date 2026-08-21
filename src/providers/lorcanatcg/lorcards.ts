/**
 * lorcards.fr — TCG Cards family row for the Lorcana pack.
 *
 * Faces stay on the official dump. Products go through `scrapeTcgCardsProducts`.
 */
import {
  scrapeTcgCardsProducts,
  type ScrapeDbscardsProductsResult,
} from "@/providers/shared/dbscards/scrapeProducts";
import {
  tcgCardsDetailCategories,
  tcgCardsListingCategories,
  tcgCardsSite,
} from "@/providers/shared/dbscards/sites";

export const LORCARDS_SITE = tcgCardsSite("lorcards");
export const LORCARDS_LISTING_CATEGORIES =
  tcgCardsListingCategories("lorcards");
export const LORCARDS_DETAIL_CATEGORIES = tcgCardsDetailCategories("lorcards");
export const LORCARDS_STAGING_FOLDER = LORCARDS_SITE.stagingFolder;

export async function scrapeLorcardsProducts(opts: {
  force?: boolean;
  offline?: boolean;
  delayMs?: number;
  limit?: number;
  onProgress?: (message: string) => void;
}): Promise<ScrapeDbscardsProductsResult> {
  return scrapeTcgCardsProducts("lorcards", opts);
}
