import { existsSync } from "node:fs";

import type {
  ProviderCatalogHooks,
  ProviderCatalogRefreshOpts,
} from "@/types/providerModule";
import {
  dataPackPath,
  statusFromLastRun,
} from "@/providers/shared/catalogCorpus";

import { scrapeLorcanaCards } from "./scrapeCards";
import { scrapeLorcardsProducts } from "./lorcards";

const DATA_PACK = "lorcana";

export async function refreshLorcanaTcgCatalog(
  opts?: ProviderCatalogRefreshOpts,
): Promise<void> {
  // Rebuild catalogue faces + sqlite. Full Unity foil extract stays on CLI /
  // foilExtract until the Unity island is invoked from this pipeline.
  await scrapeLorcanaCards({ force: Boolean(opts && !opts.auto) });
  /*
    lorcards.fr is the same host family as dbscards. Manual Sync takes the
    product graph (sequential, cache-friendly). The hourly loop skips it.
  */
  if (!opts?.auto) {
    await scrapeLorcardsProducts({});
  }
}

export function lorcanaTcgCatalogStatus() {
  const cardsIndex = dataPackPath(DATA_PACK, "cards-index.json");
  const db = dataPackPath(DATA_PACK, "catalog.sqlite");
  const empty = !existsSync(cardsIndex) && !existsSync(db);
  return statusFromLastRun({ dataPack: DATA_PACK, empty });
}

export const lorcanatcgCatalog: ProviderCatalogHooks = {
  dataPack: DATA_PACK,
  status: lorcanaTcgCatalogStatus,
  refresh: refreshLorcanaTcgCatalog,
};
