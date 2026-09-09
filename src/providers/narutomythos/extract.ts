/**
 * Naruto Mythos pack extract — Catalogue Sync / worker (in-process).
 */
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";
import {
  harvestGgArchiveCards,
  harvestGgArchivePrices,
} from "@/providers/shared/naruto/ggArchiveHarvest";

import { buildMythosFromLedgers } from "./buildFromLedgers";
import { harvestMythosFaces, installMythosFaces } from "./lorenzoneFaces";
import {
  harvestOfficialMythosFaces,
  installOfficialMythosFaces,
} from "./officialFaces";
import { ingestMythosSealedProducts } from "./sealedProducts";
import { NARUTO_MYTHOS_PACK_ID, narutoMythosCuratedDir } from "./pack";

export async function runNarutoMythosPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const skipFaces = argv.includes("--titles-only");
  const skipGg = argv.includes("--skip-gg");
  const skipOfficial = argv.includes("--skip-official");
  const skipLorenzone = argv.includes("--skip-lorenzone");
  if (!skipGg) {
    try {
      const gg = await harvestGgArchiveCards({
        packId: NARUTO_MYTHOS_PACK_ID,
        line: "mythos",
      });
      console.log(`── narutocardgame.gg mythos — ${gg.cards} carte(s) indexées`);
      const prices = await harvestGgArchivePrices({
        packId: NARUTO_MYTHOS_PACK_ID,
        line: "mythos",
      });
      console.log(`── narutocardgame.gg mythos prices — ${prices.rows} ligne(s)`);
    } catch (err) {
      console.warn(
        `── narutocardgame.gg mythos — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  if (!skipFaces && !skipOfficial) {
    try {
      const harvested = await harvestOfficialMythosFaces({ force });
      console.log(
        `── CICABOOM official — ${harvested.cards} carte(s), ${harvested.ok} WebP, ${harvested.skip} déjà là, ${harvested.fail} manqué${harvested.fail === 1 ? "" : "s"}`,
      );
    } catch (err) {
      console.warn(
        `── CICABOOM official — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  if (!skipFaces && !skipLorenzone) {
    const harvested = await harvestMythosFaces({ force });
    console.log(
      `── LorenZone faces — ${harvested.ok} WebP, ${harvested.skip} déjà là, ${harvested.fail} manqué${harvested.fail === 1 ? "" : "s"}`,
    );
  }
  return runLocalTcgPipeline({
    packId: NARUTO_MYTHOS_PACK_ID,
    curatedDir: narutoMythosCuratedDir(),
    label: "Naruto Mythos",
    seed: async (index) => {
      const built = buildMythosFromLedgers({ index });
      if (built.skipped.length) {
        console.log(
          `── Mythos — ${built.skipped.length} écartée(s) : ${built.skipped.join(", ")}`,
        );
      }
      if (!skipFaces && !skipOfficial) {
        const faces = await installOfficialMythosFaces(index);
        console.log(
          `── Faces — official ${faces.faces}${faces.missing.length ? `, manquant(s) ${faces.missing.length}` : ""}`,
        );
      }
      if (!skipFaces && !skipLorenzone) {
        const faces = await installMythosFaces(index);
        console.log(
          `── Faces — LorenZone ${faces.faces}${faces.missing.length ? `, manquant(s) ${faces.missing.length}` : ""}`,
        );
      }
      return { prints: built.prints, titles: built.titles };
    },
    seedProducts: async () => ingestMythosSealedProducts(),
  });
}
