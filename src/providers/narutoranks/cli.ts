#!/usr/bin/env tsx
/**
 * Naruto Ninja Ranks — checklist officielle Inkworks → catalogue.
 *
 *   pnpm naruto:ranks
 *   pnpm naruto:ranks -- --force   # re-télécharge Wayback + dumps fan
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { buildNinjaRanksFromLedgers } from "./buildFromLedgers";
import {
  harvestInkworksOfficialAssets,
  ingestInkworksProducts,
  installInkworksSampleFaces,
} from "./inkworksOfficial";
import {
  harvestBloggerPackRip,
  installBloggerPackRip,
} from "./unofficialVisuals";
import { NARUTO_RANKS_PACK_ID, narutoRanksCuratedDir } from "./pack";

export async function runNarutoRanksPackPipeline(
  argv: readonly string[] = process.argv,
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const harvested = await harvestInkworksOfficialAssets({ force });
  console.log(
    `── Inkworks — ${harvested.ok} JPEG, ${harvested.skip} déjà là, ${harvested.fail} manqué${harvested.fail === 1 ? "" : "s"}`,
  );
  const unofficial = await harvestBloggerPackRip({ force });
  console.log(
    `── Blogger — ${unofficial.ok} JPEG, ${unofficial.skip} déjà là, ${unofficial.fail} manqué${unofficial.fail === 1 ? "" : "s"}`,
  );
  return runLocalTcgPipeline({
    packId: NARUTO_RANKS_PACK_ID,
    curatedDir: narutoRanksCuratedDir(),
    label: "Naruto Ninja Ranks",
    seed: (index) => {
      const report = buildNinjaRanksFromLedgers({ index });
      const faces = installInkworksSampleFaces(index);
      if (faces.installed) {
        console.log(
          `── Naruto Ninja Ranks — ${faces.installed} face${faces.installed === 1 ? "" : "s"} échantillon`,
        );
      }
      const fan = installBloggerPackRip(index);
      if (fan.cards || fan.products || fan.backs) {
        console.log(
          `── Naruto Ninja Ranks — dumps fan : ${fan.cards} face, ${fan.backs} verso, ${fan.products} packshot`,
        );
      }
      return report;
    },
    seedProducts: () => ingestInkworksProducts(),
  });
}

const thisFile = fileURLToPath(import.meta.url);
export const NARUTO_RANKS_CLI_PATH = thisFile;
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === thisFile) {
  runNarutoRanksPackPipeline(process.argv).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
