/**
 * Crochets de catalogue du pack `pokemon`.
 *
 * Corps commun : `shared/cardCatalogue/pipeline`. Sync = foil extract
 * (CDN / Malie / APK) + ré-index Live + cards-index + produits pkmcards.fr.
 * Pas de chemin produit hors `catalog.refresh`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { POKEMON_EFFECT_PACK_ID } from "@/effects/pokemon";
import type { ProviderCatalogHooks } from "@/types/providerModule";
import { cardCatalogueHooks } from "@/providers/shared/cardCatalogue/pipeline";
import { measureCatalogDbCorpus } from "@/providers/shared/catalogCorpus";
import { scrapeTcgCardsProducts } from "@/providers/shared/tcgcards/scrapeProducts";
import { installProviderProductsContents } from "@/providers/shared/sealedProducts/curatedContents";
import {
  ensurePokemonDbLayout,
  pokemonIdentityDbPath,
  pokemonLiveDbPath,
  POKEMON_PACK_ID,
} from "@/providers/pokemon/paths";

import { pokemonDesktopClient } from "../cdn/desktopClient";
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
  effectPackId: POKEMON_EFFECT_PACK_ID,
  dbPath: cardsDbPath,
  // Identity corpus is catalog.sqlite; dbPath stays on live.sqlite for empty/stale.
  measureCorpus: () => measureCatalogDbCorpus(pokemonIdentityDbPath()),
  runPipeline: async (argv) => {
    const { runPokemonFoilExtract } = await import(
      /* webpackIgnore: true */
      "@/providers/pokemon/live/extract"
    );
    await runPokemonFoilExtract(argv);
    try {
      indexLiveCards();
    } catch (err) {
      console.warn(
        `[pokemon catalog] live index skipped: ${err instanceof Error ? err.message : err}`,
      );
    }
    // Offsets Shiny Vault (*sv) — dérivés du dump + TCGdex, jamais à la main.
    try {
      const { refreshPokemonReprintMeta } =
        await import("@/providers/pokemon/live/extract/reprintMeta");
      const n = await refreshPokemonReprintMeta();
      if (n != null) console.log(`── reprintMeta : ${n} split(s) *sv`);
    } catch (err) {
      console.warn(
        `[pokemon catalog] reprintMeta skipped: ${err instanceof Error ? err.message : err}`,
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
    installProviderProductsContents(POKEMON_PACK_ID, POKEMON_PRODUCTS_CONTENTS);
    await scrapeTcgCardsProducts("pkmcards", {});
  },
});

export const refreshPokemonLiveCatalog = hooks.refresh;
export const pokemonLiveCatalogStatus = hooks.status;
export const pokemontcgliveCatalog: ProviderCatalogHooks = {
  ...hooks,
  // Build desktop officiel (updater de l'éditeur) : les miroirs d'APK ne
  // portent plus TCG Live. Même Data/ Unity → maillage Card + dos de carte.
  ensureClient: pokemonDesktopClient(POKEMON_PACK_ID),
};
