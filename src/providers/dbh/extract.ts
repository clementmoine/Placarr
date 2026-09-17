/**
 * Dragon Ball Heroes pack extract — scrape carddass.com then seed index.
 */
import path from "node:path";

import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";
import { installProviderProductsContents } from "@/providers/shared/sealedProducts/curatedContents";

import { installDbhFromLedger } from "./buildFromLedgers";
import { DBH_PACK_ID, dbhCuratedDir } from "./pack";
import { scrapeDbhCardlists } from "./scrapeCardlist";

export async function runDbhPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const skipScrape = argv.includes("--skip-scrape");
  const skipFaces = argv.includes("--skip-faces");
  const maxCatArg = argv.find((a) => a.startsWith("--max-categories="));
  const maxCategories = maxCatArg
    ? Number(maxCatArg.split("=")[1])
    : undefined;

  if (!skipScrape) {
    const scraped = await scrapeDbhCardlists({
      maxCategories:
        Number.isFinite(maxCategories) && (maxCategories ?? 0) > 0
          ? maxCategories
          : undefined,
    });
    console.log(
      `── DBH scrape — ${scraped.categories} catégories, ${scraped.cards.length} cartes → ${scraped.outPath}`,
    );
  }

  installProviderProductsContents(
    DBH_PACK_ID,
    path.join(dbhCuratedDir(), "products-contents.json"),
  );

  return runLocalTcgPipeline({
    packId: DBH_PACK_ID,
    curatedDir: dbhCuratedDir(),
    label: "Dragon Ball Heroes",
    seed: async (index) => {
      const installed = await installDbhFromLedger(index, {
        downloadFaces: !skipFaces,
      });
      console.log(
        `── DBH seed — ${installed.prints} prints, ${installed.titles} titles, ${installed.faces} faces`,
      );
      return { prints: installed.prints, titles: installed.titles };
    },
  });
}
