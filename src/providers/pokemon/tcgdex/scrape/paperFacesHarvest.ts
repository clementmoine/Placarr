/**
 * Paper-face harvest for Pokémon (mcdn encyclopédie + McDo tiles + PokéCardex
 * scans + Coleka + TCGPlayer + pokemontcg.io + pkmcards.fr).
 *
 * Bulk TCGdex CDN dump (`art.tcgdex.*`) is **opt-in** (`tcgdexCatalogue: true`):
 * assets.tcgdex.net is a reliable remote fallback for the paper catalogue —
 * scraping ~20k highs is optional disk/offline insurance, not required for Sync.
 *
 * Catalogue Sync / CLI — take every available *specialized* source face;
 * faceChoice ranks which one the UI shows.
 */
import { rebuildPokemonCardsIndex } from "@/providers/pokemon/live/pipeline/rebuildCardsIndex";

import { harvestColekaMcdoFaces } from "./coleka/scrapeColekaPokemonFaces";
import { harvestColekaMcdoPrices } from "./coleka/colekaPrices";
import {
  fillMcdnGalleryFaces,
  fillPkmcardsFaces,
  fillPokemonComMcdoFaces,
  fillPokemontcgIoFacesForSet,
  fillTcgdexCatalogueFaces,
  fillTcgplayerMcdo2023,
  POKEMONTCG_MCDO_STEMS,
} from "./faces";
import { fillPokecardexMcdoFaces } from "./pokecardex/fillMcdo";
import { fillPokecardexRetailFaces } from "./pokecardex/fillSets";

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
  indexCards: number;
};

export async function runPokemonPaperFacesHarvest(
  opts: {
    force?: boolean;
    cardsRoot?: string;
    /** Default true for standalone harvest; extract runner rebuilds once after. */
    rebuildIndex?: boolean;
    /**
     * Bulk-download TCGdex catalogue CDN → `art.tcgdex.*`.
     * Default **false** — remote CDN is the normal fallback; enable for offline
     * / mirror. Specialized sources (mcdn, McDo, …) always run.
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

  if (opts.tcgdexCatalogue) {
    console.log("── Pokémon paper faces — TCGdex catalogue CDN");
    let lastLog = 0;
    tcgdex = await fillTcgdexCatalogueFaces({
      force: opts.force,
      cardsRoot: opts.cardsRoot,
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
      "── Pokémon paper faces — TCGdex catalogue skipped (CDN fallback; pass tcgdexCatalogue: true to mirror)",
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
    const row = await fillPokemontcgIoFacesForSet({
      setId,
      localIds,
      force: opts.force,
      cardsRoot: opts.cardsRoot,
    });
    if (row.written + row.skipped > 0 || row.failed < row.tried) {
      console.log(
        `   pokemontcg.io ${setId}: ${row.written} écrites / ${row.skipped} skip / ${row.failed} fail`,
      );
    }
    pokemontcg.push(row);
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
    indexCards: index.cards,
  };
}
