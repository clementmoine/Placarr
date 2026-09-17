/**
 * Paper-face harvest for Pokémon (mcdn encyclopédie + McDo tiles + Coleka +
 * TCGPlayer + pokemontcg.io + pkmcards.fr). Catalogue Sync / CLI — take every
 * available source face; faceChoice ranks which one the UI shows.
 */
import { rebuildPokemonCardsIndex } from "@/providers/pokemontcglive/rebuildCardsIndex";

import { harvestColekaMcdoFaces } from "./coleka/scrapeColekaPokemonFaces";
import { fillMcdnGalleryFaces } from "./faces/fillMcdnFaces";
import { fillPkmcardsFaces } from "./faces/fillPkmcards";
import { fillPokemonComMcdoFaces } from "./faces/fillPokemonComMcdo";
import { fillTcgplayerMcdo2023 } from "./faces/fillTcgplayer";
import {
  fillPokemontcgIoFacesForSet,
  POKEMONTCG_MCDO_STEMS,
} from "./faces/fillPokemontcgIo";

export type PokemonPaperFacesReport = {
  mcdn: Awaited<ReturnType<typeof fillMcdnGalleryFaces>>;
  pokemoncom: Awaited<ReturnType<typeof fillPokemonComMcdoFaces>>;
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
  } = {},
): Promise<PokemonPaperFacesReport> {
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
    mcdn,
    pokemoncom,
    coleka,
    tcgplayer,
    pokemontcg,
    pkmcards,
    indexCards: index.cards,
  };
}
