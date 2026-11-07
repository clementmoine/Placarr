/**
 * Dragon Ball Lamincards pack extract — Catalogue Sync / worker (in-process).
 *
 * Faces : Dragon Ball Center + dbzcollection.fr (FR part 1 / Série Or).
 * Scellés : packshots dbzcollection.
 *
 * STEPS (`--only` / `--skip` / `--offline`) : `seed` · `faces` · `products`.
 */
import path from "node:path";

import { selectCatalogueSteps } from "@/providers/shared/cardCatalogue/catalogueSteps";
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";
import { installProviderProductsContents } from "@/providers/shared/sealedProducts/curatedContents";

import { harvestDbcFaces, installDbcFaces } from "./install/dbcFaces";
import {
  harvestDbzcollection,
  ingestDbzcollectionSealedProducts,
  installDbzcollectionFaces,
  installDbzcollectionTitles,
} from "./scrape/dbzcollection";
import { DBS_LAMINCARDS_PACK_ID, dbsLamincardsCuratedDir } from "./pack";

export const DBS_LAMINCARDS_STEPS = ["seed", "faces", "products"] as const;
export type DbsLamincardsStep = (typeof DBS_LAMINCARDS_STEPS)[number];
/** Harvest DLs are network; install from disk still runs when the step is kept. */
const DBS_LAMINCARDS_ONLINE = new Set<DbsLamincardsStep>(["faces"]);

export function selectDbsLamincardsSteps(
  argv: readonly string[],
): DbsLamincardsStep[] {
  return selectCatalogueSteps(argv, DBS_LAMINCARDS_STEPS, {
    online: DBS_LAMINCARDS_ONLINE,
  });
}

export async function runDbsLamincardsPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const steps = selectDbsLamincardsSteps(argv);
  console.log(
    `── Dragon Ball Lamincards — étapes : ${steps.join(" → ") || "(curated only)"}`,
  );

  if (steps.includes("faces") && !argv.includes("--offline")) {
    const harvested = await harvestDbcFaces({ force, argv });
    console.log(
      `── DBC — ${harvested.series} série(s), ${harvested.cards} fiche(s) : ${harvested.ok} DL, ${harvested.skip} déjà là, ${harvested.fail} manqué${harvested.fail === 1 ? "" : "s"}`,
    );

    const dbzc = await harvestDbzcollection({ force, argv });
    console.log(
      `── dbzc — ${dbzc.sets} set(s), ${dbzc.cards} carte(s), ${dbzc.packs} SKU : ${dbzc.ok} DL, ${dbzc.skip} déjà là, ${dbzc.fail} manqué${dbzc.fail === 1 ? "" : "s"}`,
    );
  }

  if (steps.includes("products")) {
    installProviderProductsContents(
      DBS_LAMINCARDS_PACK_ID,
      path.join(dbsLamincardsCuratedDir(), "products-contents.json"),
    );
  }

  return runLocalTcgPipeline({
    packId: DBS_LAMINCARDS_PACK_ID,
    curatedDir: dbsLamincardsCuratedDir(),
    label: "Dragon Ball Lamincards",
    seed:
      steps.includes("seed") || steps.includes("faces")
        ? (index) => {
            let prints = 0;
            let titles = 0;
            if (steps.includes("faces") || steps.includes("seed")) {
              const installed = installDbcFaces(index, { argv });
              if (installed.missing.length) {
                console.log(
                  `── DBC faces — ${installed.missing.length} manquante(s) (ex. ${installed.missing.slice(0, 5).join(", ")})`,
                );
              }
              console.log(`── Faces DBC — ${installed.faces}`);
              prints += installed.prints;
              titles += installed.titles;

              if (steps.includes("faces")) {
                const dbzcFaces = installDbzcollectionFaces(index, { argv });
                console.log(
                  `── Faces dbzc — ${dbzcFaces.faces} index, ${dbzcFaces.dumps} dump(s)`,
                );
                prints += dbzcFaces.prints;
                titles += dbzcFaces.titles;
              }

              if (steps.includes("seed")) {
                const dbzcTitles = installDbzcollectionTitles(index, { argv });
                console.log(
                  `── Titres dbzc — ${dbzcTitles.titles} posé(s), ${dbzcTitles.matched} match, ${dbzcTitles.skipped} skip`,
                );
                titles += dbzcTitles.titles;
              }
            }
            return { prints, titles };
          }
        : undefined,
    seedProducts: steps.includes("products")
      ? () => ingestDbzcollectionSealedProducts({ argv })
      : undefined,
  });
}
