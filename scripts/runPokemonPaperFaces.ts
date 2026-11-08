/**
 * Densify Pokémon paper faces (TCGdex CDN + specialized JA/FR sources).
 *
 *   pnpm tsx scripts/runPokemonPaperFaces.ts
 *   pnpm tsx scripts/runPokemonPaperFaces.ts --no-tcgdex
 */
import { runPokemonPaperFacesHarvest } from "@/providers/pokemon/tcgdex/scrape/paperFacesHarvest";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const tcgdexCatalogue = !argv.includes("--no-tcgdex");
  console.log(
    `── Pokémon paper-faces — tcgdexCatalogue=${tcgdexCatalogue}`,
  );
  const report = await runPokemonPaperFacesHarvest({
    rebuildIndex: true,
    tcgdexCatalogue,
  });
  console.log(
    JSON.stringify(
      {
        tcgdex: report.tcgdex,
        trainersJa: report.trainersJa,
        limitlessJa: report.limitlessJa,
        dittobaseJa: report.dittobaseJa,
        alamedyangJa: report.alamedyangJa,
        pokellectorJa: report.pokellectorJa,
        cardnexus: report.cardnexus,
        indexCards: report.indexCards,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
