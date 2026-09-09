/**
 * Dragon Ball Lamincards pack extract — Catalogue Sync / worker (in-process).
 *
 * Faces : Dragon Ball Center + dbzcollection.fr (FR part 1 / Série Or).
 * Scellés : packshots dbzcollection.
 */
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { harvestDbcFaces, installDbcFaces } from "./dbcFaces";
import {
  harvestDbzcollection,
  ingestDbzcollectionSealedProducts,
  installDbzcollectionFaces,
  installDbzcollectionTitles,
} from "./dbzcollection";
import { DBS_LAMINCARDS_PACK_ID, dbsLamincardsCuratedDir } from "./pack";

export async function runDbsLamincardsPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const harvested = await harvestDbcFaces({ force, argv });
  console.log(
    `── DBC — ${harvested.series} série(s), ${harvested.cards} fiche(s) : ${harvested.ok} DL, ${harvested.skip} déjà là, ${harvested.fail} manqué${harvested.fail === 1 ? "" : "s"}`,
  );

  const dbzc = await harvestDbzcollection({ force, argv });
  console.log(
    `── dbzc — ${dbzc.sets} set(s), ${dbzc.cards} carte(s), ${dbzc.packs} SKU : ${dbzc.ok} DL, ${dbzc.skip} déjà là, ${dbzc.fail} manqué${dbzc.fail === 1 ? "" : "s"}`,
  );

  return runLocalTcgPipeline({
    packId: DBS_LAMINCARDS_PACK_ID,
    curatedDir: dbsLamincardsCuratedDir(),
    label: "Dragon Ball Lamincards",
    seed: (index) => {
      const installed = installDbcFaces(index, { argv });
      if (installed.missing.length) {
        console.log(
          `── DBC faces — ${installed.missing.length} manquante(s) (ex. ${installed.missing.slice(0, 5).join(", ")})`,
        );
      }
      console.log(`── Faces DBC — ${installed.faces}`);

      const dbzcFaces = installDbzcollectionFaces(index, { argv });
      console.log(
        `── Faces dbzc — ${dbzcFaces.faces} index, ${dbzcFaces.dumps} dump(s)`,
      );

      const dbzcTitles = installDbzcollectionTitles(index, { argv });
      console.log(
        `── Titres dbzc — ${dbzcTitles.titles} posé(s), ${dbzcTitles.matched} match, ${dbzcTitles.skipped} skip`,
      );
      return {
        prints: installed.prints + dbzcFaces.prints,
        titles:
          installed.titles + dbzcFaces.titles + dbzcTitles.titles,
      };
    },
    seedProducts: () => {
      const sealed = ingestDbzcollectionSealedProducts({ argv });
      return sealed;
    },
  });
}
