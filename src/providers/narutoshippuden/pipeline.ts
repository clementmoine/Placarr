/**
 * Crochets de catalogue du pack `naruto/shippuden`.
 *
 * La passe se lit dans cet ordre, et l'ordre porte le sens :
 *
 * 1. **la migration** depuis le pack Carddass, où les deux jeux ont cohabité —
 *    elle apporte les faces et les tirages qu'aucune liste ne nomme ;
 * 2. **les registres officiels** du jeu (第一幕…第四幕, 忍伝-学), qui font
 *    autorité sur l'acte et le titre et écrasent donc ce que la migration a
 *    deviné — c'est ce second temps qui rend leur acte aux douze tirages
 *    arrivés en `unknown` ;
 * 3. **le verso curé**, que le pack d'effets va chercher par son nom ;
 * 4. **les produits scellés** — dix-neuf SKU qui s'écrivaient dans l'index du
 *    Carddass jusqu'au 2026-08-21 ;
 * 5. **l'index JSON**, projection de la base, réécrite après elle : c'est lui
 *    que lit l'écran Catalogue, et l'oublier laissait un catalogue peuplé
 *    s'afficher « 0 carte ».
 *
 * La migration copie aussi faces + staging harvest (`nikita-nrt` /
 * `nikita-backs`) vers `data/naruto/shippuden/` — le pack ne dépend plus de
 * `carddass/staging/` pour se reconstruire (les harvests Carddass restent
 * la source amont tant qu'ils n'ont pas leur propre CLI).
 */
import type { ProviderCatalogHooks } from "@/types/providerModule";
import { cardCatalogueHooks } from "@/providers/shared/cardCatalogue/pipeline";

import { narutoShippudenDbPath, NARUTO_SHIPPUDEN_PACK_ID } from "./indexStore";

const hooks = cardCatalogueHooks({
  packId: NARUTO_SHIPPUDEN_PACK_ID,
  dbPath: narutoShippudenDbPath,
  runPipeline: async () => {
    const { migrateShippudenFromCarddass } = await import(
      /* webpackIgnore: true */
      "./migrateFromCarddass"
    );
    const migrated = migrateShippudenFromCarddass();

    const { buildShippudenFromLedgers } = await import(
      /* webpackIgnore: true */
      "./buildFromLedgers"
    );
    const ledgers = buildShippudenFromLedgers();

    const { installCuratedCardBacks, curatedCardsDir } = await import(
      /* webpackIgnore: true */
      "@/providers/shared/curatedCardsInstall"
    );
    const { narutoShippudenCuratedDir } = await import(
      /* webpackIgnore: true */
      "./assets"
    );
    const { packCardsDir } = await import(
      /* webpackIgnore: true */
      "@/lib/packPaths"
    );
    /*
      Pas de plaque de foil : ce pack déclare `hasFoilEffects === false`, aucun
      foil n'ayant été capté sur ce jeu. En générer une dirait « tout brille »
      d'un catalogue qui ne brille pas.
    */
    await installCuratedCardBacks({
      curatedCardsDir: curatedCardsDir(narutoShippudenCuratedDir()),
      destCardsDir: packCardsDir(NARUTO_SHIPPUDEN_PACK_ID),
    });

    const { ingestNarutoShippudenSealedProducts } = await import(
      /* webpackIgnore: true */
      "./sealedProducts"
    );
    const sealed = await ingestNarutoShippudenSealedProducts();

    const { exportNarutoShippudenCardsIndex } = await import(
      /* webpackIgnore: true */
      "./indexStore"
    );
    exportNarutoShippudenCardsIndex();
    return { ...migrated, ledgers, sealed };
  },
});

export const refreshNarutoShippudenCatalog = hooks.refresh;
export const narutoShippudenCatalogStatus = hooks.status;
export const narutoShippudenCatalog: ProviderCatalogHooks = hooks;
