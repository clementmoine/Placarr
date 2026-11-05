/**
 * Crochets de catalogue du pack `lorcana`.
 *
 * Corps commun : `shared/cardCatalogue/pipeline`. Sync = foil extract
 * (web / Unity / APK) + moisson cartes + produits lorcards.fr.
 * Pas de chemin produit hors `catalog.refresh`.
 */
import { LORCANA_EFFECT_PACK_ID } from "@/effects/lorcana";
import type { ProviderCatalogHooks } from "@/types/providerModule";
import { withCardnexusPackFacesStep } from "@/providers/commerce/cardnexus/fillPackFaces";
import { cardCatalogueHooks } from "@/providers/shared/cardCatalogue/pipeline";

import { lorcanaTcgDbPath } from "../indexStore";
import { scrapeLorcardsProducts } from "../sources/lorcards";
import { scrapeLorcanaCards } from "../scrape/cards";
import { runOfficialSiteProductsStep } from "../scrape/officialSiteStep";

const LORCANA_PACK_ID = "lorcana";

const hooks = cardCatalogueHooks({
  packId: LORCANA_PACK_ID,
  effectPackId: LORCANA_EFFECT_PACK_ID,
  dbPath: lorcanaTcgDbPath,
  runPipeline: withCardnexusPackFacesStep(
    { packId: LORCANA_PACK_ID, printGame: "lorcana" },
    async (argv) => {
      const { runLorcanaFoilExtract } = await import(
        /* webpackIgnore: true */
        "@/providers/lorcana/lorcanatcg/extract"
      );
      await runLorcanaFoilExtract(argv);
      /*
        Jamais `force` ici : Sync = admin manuel ou auto, pas de CLI. Un
        retéléchargement massif ne faisait que bouger les mtime (même pixels).
        Les trous restent comblés (`skipExisting` dans scrapeLorcanaCards).
      */
      await scrapeLorcanaCards({});
      await scrapeLorcardsProducts({});
      /*
        Découverte automatique des SKU officiels (Hyperia, Quêtes, …) : harvest
        TTL-gated → logos → upsert → purge. Sans ça, Sync ne voyait que lorcards.
      */
      await runOfficialSiteProductsStep({
        force: false,
        spoilers: false,
        log: (message) => console.log(message),
      });
    },
  ),
});

export const refreshLorcanaTcgCatalog = hooks.refresh;
export const lorcanaTcgCatalogStatus = hooks.status;
export const lorcanatcgCatalog: ProviderCatalogHooks = hooks;
