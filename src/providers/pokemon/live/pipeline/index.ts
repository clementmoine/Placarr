/**
 * Crochets de catalogue du pack `pokemon`.
 *
 * Corps commun : `shared/cardCatalogue/pipeline`. Ici : ré-index Live +
 * cards-index, et le graphe produits pkmcards.fr (sauté en automatique).
 *
 * L'extract CDN / Unity / APK passe par Catalogue Extract (admin / worker
 * in-process) — ce pipeline catalogue ne le lance pas.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ProviderCatalogHooks } from "@/types/providerModule";
import { cardCatalogueHooks } from "@/providers/shared/cardCatalogue/pipeline";
import { scrapeTcgCardsProducts } from "@/providers/shared/tcgcards/scrapeProducts";
import { installProviderProductsContents } from "@/providers/shared/sealedProducts/curatedContents";
import { dataRoot } from "@/lib/runtimeData";
import {
  ensurePokemonDbLayout,
  pokemonLiveDbPath,
  POKEMON_PACK_ID,
} from "@/providers/pokemon/paths";

import { indexLiveCards } from "./indexCards";
import { rebuildPokemonCardsIndex } from "./rebuildCardsIndex";

const POKEMON_PRODUCTS_CONTENTS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../tcgdex/curated/products-contents.json",
);

function cardsDbPath(): string {
  ensurePokemonDbLayout();
  return pokemonLiveDbPath();
}

const hooks = cardCatalogueHooks({
  packId: POKEMON_PACK_ID,
  dbPath: cardsDbPath,
  runPipeline: async (argv) => {
    const skipProducts = argv.includes("products");
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
        `[pokemon catalog] cards-index ${faces.cards} stems (${faces.named} nommées) → ${faces.path}`,
      );
    }
    if (!skipProducts) {
      installProviderProductsContents(
        POKEMON_PACK_ID,
        POKEMON_PRODUCTS_CONTENTS,
      );
      await scrapeTcgCardsProducts("pkmcards", {});
    }
  },
  autoSkip: ["products"],
});

export const refreshPokemonLiveCatalog = hooks.refresh;
export const pokemonLiveCatalogStatus = hooks.status;
export const pokemontcgliveCatalog: ProviderCatalogHooks = hooks;
