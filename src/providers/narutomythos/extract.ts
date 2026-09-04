/**
 * Naruto Mythos pack extract — Catalogue Sync / worker (in-process).
 */
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { buildMythosFromLedgers } from "./buildFromLedgers";
import { harvestMythosFaces, installMythosFaces } from "./lorenzoneFaces";
import { ingestMythosSealedProducts } from "./sealedProducts";
import { NARUTO_MYTHOS_PACK_ID, narutoMythosCuratedDir } from "./pack";

export async function runNarutoMythosPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const skipFaces = argv.includes("--titles-only");
  if (!skipFaces) {
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
      if (!skipFaces) {
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
