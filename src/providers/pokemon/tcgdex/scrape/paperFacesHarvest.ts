/**
 * Paper-face harvest for Pokémon (TCGdex CDN → disk + mcdn encyclopédie +
 * McDo tiles + PokéCardex scans + Coleka + TCGPlayer + pokemontcg.io +
 * pkmcards.fr + Trainers JA + Limitless JA + Dittobase JA + Alamedyang
 * vintage JA + Pokéllector JA-order + CardNexus catalogue CDN).
 *
 * **Local-first contract:** CDN (`assets.tcgdex.net`) is Sync *input* only.
 * Runtime grid / picker / CLIP read disk under `data/pokemon/cards/` (served
 * `/assets/`). Bulk TCGdex dump (`art.tcgdex.*`) runs by default; pass
 * `tcgdexCatalogue: false` for a light specialized-sources-only run.
 *
 * Catalogue Sync / CLI — take every available source face; faceChoice ranks
 * which one the UI shows.
 */
import { rebuildPokemonCardsIndex } from "@/providers/pokemon/live/pipeline/rebuildCardsIndex";
import { syncTcgdexPrintAssetsFromDisk } from "@/providers/pokemon/tcgdex/indexStore";

import { harvestColekaMcdoFaces } from "./coleka/scrapeColekaPokemonFaces";
import { harvestColekaMcdoPrices } from "./coleka/colekaPrices";
import { harvestTcgdexMcdoPrices } from "./tcgdexMcdoPrices";
import {
  fillMcdnGalleryFaces,
  fillPkmcardsFaces,
  fillPokemonComMcdoFaces,
  fillPokemontcgIoFacesForSet,
  fillTcgdexCatalogueFaces,
  fillTcgplayerMcdo2023,
  POKEMONTCG_MCDO_STEMS,
} from "./faces";
import { fillAlamedyangJaFaces } from "./alamedyang/fillJaFaces";
import { fillPokemonCardnexusFaces } from "./cardnexus/fillFaces";
import { fillDittobaseJaFaces } from "./dittobase/fillJaFaces";
import { fillLimitlessJaFaces } from "./limitless/fillJaFaces";
import { fillLimitlessPocketFacesForSet } from "./limitless/fillPocketFaces";
import { fillPokecardexMcdoFaces } from "./pokecardex/fillMcdo";
import { fillPokecardexRetailFaces } from "./pokecardex/fillSets";
import { fillPokellectorJaFaces } from "./pokellector/fillJaFaces";
import { fillTrainersJaFaces } from "./trainers/fillJaFaces";

export type PokemonPaperFacesReport = {
  tcgdex: Awaited<ReturnType<typeof fillTcgdexCatalogueFaces>>;
  mcdn: Awaited<ReturnType<typeof fillMcdnGalleryFaces>>;
  pokemoncom: Awaited<ReturnType<typeof fillPokemonComMcdoFaces>>;
  pokecardex: Awaited<ReturnType<typeof fillPokecardexMcdoFaces>>;
  pokecardexRetail: Awaited<ReturnType<typeof fillPokecardexRetailFaces>>;
  coleka: Awaited<ReturnType<typeof harvestColekaMcdoFaces>>;
  tcgplayer: Awaited<ReturnType<typeof fillTcgplayerMcdo2023>>;
  pokemontcg: Awaited<ReturnType<typeof fillPokemontcgIoFacesForSet>>[];
  pkmcards: Awaited<ReturnType<typeof fillPkmcardsFaces>>;
  trainersJa: Awaited<ReturnType<typeof fillTrainersJaFaces>>;
  limitlessJa: Awaited<ReturnType<typeof fillLimitlessJaFaces>>;
  dittobaseJa: Awaited<ReturnType<typeof fillDittobaseJaFaces>>;
  alamedyangJa: Awaited<ReturnType<typeof fillAlamedyangJaFaces>>;
  pokellectorJa: Awaited<ReturnType<typeof fillPokellectorJaFaces>>;
  cardnexus: Awaited<ReturnType<typeof fillPokemonCardnexusFaces>>;
  indexCards: number;
};

export async function runPokemonPaperFacesHarvest(
  opts: {
    force?: boolean;
    cardsRoot?: string;
    /** Default true for standalone harvest; extract runner rebuilds once after. */
    rebuildIndex?: boolean;
    /**
     * Bulk-download TCGdex catalogue CDN → `art.tcgdex.*` (Sync densify).
     * Default **true** — CDN is Sync input; disk is runtime. Pass `false` to
     * skip the bulk mirror (specialized sources still run).
     */
    tcgdexCatalogue?: boolean;
  } = {},
): Promise<PokemonPaperFacesReport> {
  let tcgdex: Awaited<ReturnType<typeof fillTcgdexCatalogueFaces>> = {
    langs: [],
    prints: 0,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
  };

  const runTcgdexCatalogue = opts.tcgdexCatalogue !== false;
  if (runTcgdexCatalogue) {
    console.log("── Pokémon paper faces — TCGdex catalogue CDN → disk");
    let lastLog = 0;
    tcgdex = await fillTcgdexCatalogueFaces({
      force: opts.force,
      cardsRoot: opts.cardsRoot,
      // Mirror FR+EN+JA — JA catalogue gaps are mostly empty `print_assets`
      // despite TCGdex `/ja/` CDN existing for shared sets.
      langs: ["fr", "en", "ja"],
      onProgress: (done, total) => {
        if (done - lastLog < 500 && done !== total) return;
        lastLog = done;
        console.log(`   tcgdex progress ${done}/${total}`);
      },
    });
    console.log(
      `   tcgdex: ${tcgdex.written} écrites / ${tcgdex.skipped} skip / ${tcgdex.failed} fail (${tcgdex.prints} tirages × ${tcgdex.langs.join("+")})`,
    );
  } else {
    console.log(
      "── Pokémon paper faces — TCGdex catalogue skipped (tcgdexCatalogue: false)",
    );
  }

  console.log("── Pokémon paper faces — mcdn encyclopédie (cms3/cms2)");
  const mcdn = await fillMcdnGalleryFaces({
    force: opts.force,
    cardsRoot: opts.cardsRoot,
  });
  for (const row of mcdn) {
    console.log(
      `   mcdn ${row.campaignId}: ${row.written} écrites / ${row.skipped} skip / ${row.failed} fail (${row.setId}/${row.lang} → ${row.galleryCode ?? "?"})`,
    );
  }

  console.log("── Pokémon paper faces — pokemon.com McDo (official tiles)");
  const pokemoncom = await fillPokemonComMcdoFaces({
    force: opts.force,
    cardsRoot: opts.cardsRoot,
  });
  for (const row of pokemoncom) {
    console.log(
      `   pokemon.com ${row.campaignId}: ${row.written} écrites / ${row.skipped} skip / ${row.failed} fail (${row.setId}/${row.lang})`,
    );
  }

  console.log("── Pokémon paper faces — PokéCardex McDo (scans)");
  const pokecardex = await fillPokecardexMcdoFaces({
    force: opts.force,
    cardsRoot: opts.cardsRoot,
  });
  for (const row of pokecardex) {
    console.log(
      `   pokecardex ${row.campaignId}: ${row.written} écrites / ${row.skipped} skip / ${row.failed} fail (${row.seriesCode} → ${row.setId}/${row.lang})`,
    );
  }

  console.log("── Pokémon paper faces — PokéCardex retail (kits / POP / sans CDN)");
  const pokecardexRetail = await fillPokecardexRetailFaces({
    force: opts.force,
    cardsRoot: opts.cardsRoot,
    language: "fr",
    onProgress: (message) => console.log(`   ${message}`),
  });
  const retailWritten = pokecardexRetail.reduce((n, r) => n + r.written, 0);
  const retailSkipped = pokecardexRetail.reduce((n, r) => n + r.skipped, 0);
  const retailFailed = pokecardexRetail.reduce((n, r) => n + r.failed, 0);
  console.log(
    `   pokecardex retail: ${retailWritten} écrites / ${retailSkipped} skip / ${retailFailed} fail (${pokecardexRetail.length} sets)`,
  );

  console.log("── Pokémon paper faces — Coleka McDo FR");
  const coleka = await harvestColekaMcdoFaces({
    force: opts.force,
    cardsRoot: opts.cardsRoot,
    lang: "fr",
  });
  for (const row of coleka) {
    console.log(
      `   Coleka ${row.branch}: ${row.written} écrites / ${row.skipped} skip / ${row.failed} fail (${row.cards} cartes, ${row.pages} pages)`,
    );
  }
  try {
    const colekaPrices = await harvestColekaMcdoPrices();
    console.log(
      `   Coleka deals prices: ${colekaPrices.ledger.withPrintKey} printKey (cote ${colekaPrices.ledger.withQuotation})`,
    );
  } catch (err) {
    console.warn(
      `   Coleka deals prices: ${err instanceof Error ? err.message : err}`,
    );
  }
  try {
    const tcgdexPrices = await harvestTcgdexMcdoPrices();
    console.log(
      `   TCGdex Cardmarket McDo: ${tcgdexPrices.ledger.withPrintKey} printKey (cote ${tcgdexPrices.ledger.withQuotation})`,
    );
  } catch (err) {
    console.warn(
      `   TCGdex Cardmarket McDo: ${err instanceof Error ? err.message : err}`,
    );
  }

  console.log("── Pokémon paper faces — TCGPlayer McDo 2023 EN");
  const tcgplayer = await fillTcgplayerMcdo2023({
    force: opts.force,
    cardsRoot: opts.cardsRoot,
  });
  console.log(
    `   TCGPlayer 2023sv: ${tcgplayer.written} écrites / ${tcgplayer.skipped} skip / ${tcgplayer.failed} fail`,
  );

  const pokemontcg = [];
  for (const setId of Object.keys(POKEMONTCG_MCDO_STEMS)) {
    const count = setId === "2021swsh" ? 25 : /swsh$/.test(setId) ? 15 : 12;
    const localIds = Array.from({ length: count }, (_, i) => String(i + 1));
    for (const lang of ["fr", "en"] as const) {
      const row = await fillPokemontcgIoFacesForSet({
        setId,
        localIds,
        lang,
        force: opts.force,
        cardsRoot: opts.cardsRoot,
      });
      if (row.written + row.skipped > 0 || row.failed < row.tried) {
        console.log(
          `   pokemontcg.io ${setId}/${lang}: ${row.written} écrites / ${row.skipped} skip / ${row.failed} fail`,
        );
      }
      pokemontcg.push(row);
    }
  }

  console.log("── Pokémon paper faces — Limitless Pocket (B2a…)");
  {
    const localIds = Array.from({ length: 131 }, (_, i) =>
      String(i + 1).padStart(3, "0"),
    );
    const pocket = await fillLimitlessPocketFacesForSet({
      // CDN path is case-sensitive (`B2a_001_EN.webp`); disk folder lowercases.
      setId: "B2a",
      localIds,
      lang: "fr",
      force: opts.force,
      cardsRoot: opts.cardsRoot,
    });
    console.log(
      `   limitless pocket B2a: ${pocket.written} écrites / ${pocket.skipped} skip / ${pocket.failed} fail`,
    );
  }

  console.log("── Pokémon paper faces — pkmcards.fr");
  const pkmcards = await fillPkmcardsFaces({
    force: opts.force,
    cardsRoot: opts.cardsRoot,
    lang: "fr",
    onProgress: (message) => console.log(`   ${message}`),
  });
  console.log(
    `   pkmcards: ${pkmcards.written} écrites / ${pkmcards.skipped} skip / ${pkmcards.unmapped} hors map / ${pkmcards.failed} fail (${pkmcards.indexCards} tuiles)`,
  );

  console.log("── Pokémon paper faces — Trainers Website JA (pokemon-card.com)");
  const trainersJa = await fillTrainersJaFaces({
    force: opts.force,
    cardsRoot: opts.cardsRoot,
    onProgress: (done, total) => {
      if (done !== total && done % 25 !== 0) return;
      console.log(`   trainers JA progress ${done}/${total}`);
    },
  });
  console.log(
    `   trainers JA: ${trainersJa.written} écrites / ${trainersJa.skipped} skip / ${trainersJa.unmapped} hors map / ${trainersJa.failed} fail (${trainersJa.prints} cibles, ${trainersJa.products} produits → assets ${trainersJa.assetsSynced})`,
  );

  console.log("── Pokémon paper faces — Limitless JA (TCGdex sans image)");
  let lastLimitlessLog = 0;
  const limitlessJa = await fillLimitlessJaFaces({
    force: opts.force,
    cardsRoot: opts.cardsRoot,
    onProgress: (done, total) => {
      if (done - lastLimitlessLog < 250 && done !== total) return;
      lastLimitlessLog = done;
      console.log(`   limitless JA progress ${done}/${total}`);
    },
  });
  console.log(
    `   limitless JA: ${limitlessJa.written} écrites / ${limitlessJa.skipped} skip / ${limitlessJa.failed} fail (${limitlessJa.prints} sans CDN → assets ${limitlessJa.assetsSynced})`,
  );

  console.log("── Pokémon paper faces — Dittobase JA (collector-order CDN)");
  let lastDittobaseLog = 0;
  const dittobaseJa = await fillDittobaseJaFaces({
    force: opts.force,
    cardsRoot: opts.cardsRoot,
    onProgress: (done, total) => {
      if (done - lastDittobaseLog < 50 && done !== total) return;
      lastDittobaseLog = done;
      console.log(`   dittobase JA progress ${done}/${total}`);
    },
  });
  console.log(
    `   dittobase JA: ${dittobaseJa.written} écrites / ${dittobaseJa.skipped} skip / ${dittobaseJa.unmapped} hors map / ${dittobaseJa.failed} fail (${dittobaseJa.prints} cibles → assets ${dittobaseJa.assetsSynced})`,
  );

  console.log("── Pokémon paper faces — Alamedyang vintage JA");
  let lastAlamedyangLog = 0;
  const alamedyangJa = await fillAlamedyangJaFaces({
    force: opts.force,
    cardsRoot: opts.cardsRoot,
    onProgress: (done, total) => {
      if (done - lastAlamedyangLog < 50 && done !== total) return;
      lastAlamedyangLog = done;
      console.log(`   alamedyang JA progress ${done}/${total}`);
    },
  });
  console.log(
    `   alamedyang JA: ${alamedyangJa.written} écrites / ${alamedyangJa.skipped} skip / ${alamedyangJa.unmapped} hors map / ${alamedyangJa.failed} fail (${alamedyangJa.prints} cibles → assets ${alamedyangJa.assetsSynced})`,
  );

  console.log("── Pokémon paper faces — Pokéllector JA-order sets");
  const pokellectorJa = await fillPokellectorJaFaces({
    force: opts.force,
    cardsRoot: opts.cardsRoot,
    onProgress: (done, total) => {
      if (done !== total && done % 50 !== 0) return;
      console.log(`   pokellector JA progress ${done}/${total}`);
    },
  });
  console.log(
    `   pokellector JA: ${pokellectorJa.written} écrites / ${pokellectorJa.skipped} skip / ${pokellectorJa.unmapped} hors map / ${pokellectorJa.failed} fail (${pokellectorJa.prints} cibles → assets ${pokellectorJa.assetsSynced})`,
  );

  console.log("── Pokémon paper faces — CardNexus catalogue CDN (gaps)");
  let lastCardnexusLog = 0;
  const cardnexus = await fillPokemonCardnexusFaces({
    force: opts.force,
    cardsRoot: opts.cardsRoot,
    onProgress: (done, total) => {
      if (done - lastCardnexusLog < 50 && done !== total) return;
      lastCardnexusLog = done;
      console.log(`   cardnexus progress ${done}/${total}`);
    },
  });
  console.log(
    `   cardnexus: ${cardnexus.written} écrites / ${cardnexus.skipped} skip / ${cardnexus.unmapped} hors map / ${cardnexus.failed} fail (${cardnexus.prints} cibles → assets ${cardnexus.assetsSynced})`,
  );

  // Index new faces + clear ghost `print_assets.art` (basename without file).
  const assetsSynced = syncTcgdexPrintAssetsFromDisk({
    cardsRoot: opts.cardsRoot,
    languages: ["fr", "en", "ja"],
  });
  console.log(`── print_assets sync-from-disk — ${assetsSynced} rows`);

  // Rebuild only the live data root index (custom cardsRoot = tests).
  const shouldRebuild = opts.rebuildIndex !== false && !opts.cardsRoot;
  const index = shouldRebuild
    ? rebuildPokemonCardsIndex()
    : { cards: 0 };
  if (shouldRebuild) {
    console.log(`── cards-index.json — ${index.cards} bundles`);
  }

  return {
    tcgdex,
    mcdn,
    pokemoncom,
    pokecardex,
    pokecardexRetail,
    coleka,
    tcgplayer,
    pokemontcg,
    pkmcards,
    trainersJa,
    limitlessJa,
    dittobaseJa,
    alamedyangJa,
    pokellectorJa,
    cardnexus,
    indexCards: index.cards,
  };
}
