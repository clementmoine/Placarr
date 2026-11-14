/**
 * Densify Pokémon paper faces (official CDN catalogue + specialized JA/FR sources).
 *
 *   pnpm tsx scripts/runPokemonPaperFaces.ts
 *   pnpm tsx scripts/runPokemonPaperFaces.ts --no-catalogue
 */
import { runPokemonPaperFacesHarvest } from "@/providers/pokemon/tcgdex/scrape/paperFacesHarvest";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const tcgdexCatalogue = !argv.includes("--no-catalogue");
  console.log(
    `── Pokémon paper-faces — catalogueCdn=${tcgdexCatalogue}`,
  );
  const report = await runPokemonPaperFacesHarvest({
    rebuildIndex: true,
    tcgdexCatalogue,
  });
  console.log(
    JSON.stringify(
      {
        catalogueCdn: report.tcgdex,
        trainersJa: report.trainersJa,
        limitlessJa: report.limitlessJa,
        dittobaseJa: report.dittobaseJa,
        alamedyangJa: report.alamedyangJa,
        pokellectorJa: report.pokellectorJa,
        nexus: report.cardnexus,
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
