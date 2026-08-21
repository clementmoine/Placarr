import { existsSync } from "node:fs";
import path from "node:path";

import type {
  ProviderCatalogHooks,
  ProviderCatalogRefreshOpts,
} from "@/types/providerModule";
import {
  dataPackPath,
  statusFromLastRun,
} from "@/providers/shared/catalogCorpus";
import { scrapeTcgCardsProducts } from "@/providers/shared/dbscards/scrapeProducts";
import { dataRoot } from "@/lib/runtimeData";

import { indexLiveCards } from "./indexCards";
import { rebuildPokemonCardsIndex } from "./rebuildCardsIndex";

const DATA_PACK = "pokemon";

function cardsDbPath(): string {
  const override = process.env.PLACARR_LIVE_CARDS_DB?.trim();
  if (override) return path.resolve(override);
  return path.join(dataRoot(), DATA_PACK, "catalog.sqlite");
}

export async function refreshPokemonLiveCatalog(
  opts?: ProviderCatalogRefreshOpts,
): Promise<void> {
  // Re-index identities from local config-cache when present; always refresh
  // Catalogue face index from on-disk cards/ (soft-skip if empty).
  try {
    indexLiveCards();
  } catch (err) {
    console.warn(
      `[pokemon catalog] live index skipped: ${err instanceof Error ? err.message : err}`,
    );
  }
  const faces = rebuildPokemonCardsIndex();
  if (faces.skipped) {
    console.warn("[pokemon catalog] cards-index skipped — no cards/ yet");
  } else {
    console.log(
      `[pokemon catalog] cards-index ${faces.cards} stems → ${faces.path}`,
    );
  }
  /*
    pkmcards.fr is the same host family as dbscards. Manual Sync takes the
    paper sealed-product graph. The hourly loop skips it.
  */
  if (!opts?.auto) {
    await scrapeTcgCardsProducts("pkmcards", {});
  }
}

export function pokemonLiveCatalogStatus() {
  const db = cardsDbPath();
  const cardsIndex = dataPackPath(DATA_PACK, "cards-index.json");
  const empty = !existsSync(db) && !existsSync(cardsIndex);
  return statusFromLastRun({ dataPack: DATA_PACK, empty });
}

export const pokemontcgliveCatalog: ProviderCatalogHooks = {
  dataPack: DATA_PACK,
  status: pokemonLiveCatalogStatus,
  refresh: refreshPokemonLiveCatalog,
};
