/**
 * Dragon Ball JCC (Bandai France 2005-2009) pack extract — Catalogue Sync / worker (in-process).
 *
 * Source : dbzcollection.fr (12 parts, 1 398 cartes, 46 packagings).
 */
import path from "node:path";

import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";
import { installProviderProductsContents } from "@/providers/shared/sealedProducts/curatedContents";

import {
  harvestDbzcollection,
  ingestDbzcollectionSealedProducts,
  installDbzcollectionFaces,
} from "./scrape/dbzcollection";
import { harvestCarddassFrDbz } from "./harvest/carddassFr";
import { harvestDbsJccJaFromNikita } from "./harvest/nikitaDbc";
import { installDbsJccJaTitles } from "./install/nikitaJa";
import { DBS_JCC_PACK_ID, dbsJccCuratedDir } from "./pack";

export async function runDbsJccPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const skipFaces = argv.includes("--skip-faces");
  const dbzc = await harvestDbzcollection({ force, argv });
  console.log(
    `── dbzc — ${dbzc.sets} set(s), ${dbzc.cards} carte(s), ${dbzc.packs} SKU : ${dbzc.ok} DL, ${dbzc.skip} déjà là, ${dbzc.fail} manqué${dbzc.fail === 1 ? "" : "s"}`,
  );

  const frOfficial = harvestCarddassFrDbz();
  console.log(
    `── carddass.fr/dbz — ${frOfficial.faces} face URL(s) → ${frOfficial.path}`,
  );

  const ja = await harvestDbsJccJaFromNikita();
  console.log(`── nikita DBC JA — ${ja.cards.length} titre(s) → ${ja.outPath}`);

  installProviderProductsContents(
    DBS_JCC_PACK_ID,
    path.join(dbsJccCuratedDir(), "products-contents.json"),
  );

  return runLocalTcgPipeline({
    packId: DBS_JCC_PACK_ID,
    curatedDir: dbsJccCuratedDir(),
    label: "Dragon Ball Carddass / JCC",
    seed: async (index) => {
      const dbzcFaces = installDbzcollectionFaces(index, { argv });
      console.log(
        `── Faces dbzc — ${dbzcFaces.faces} index, ${dbzcFaces.dumps} dump(s)`,
      );
      const jaInstall = await installDbsJccJaTitles(index, {
        downloadFaces: !skipFaces,
      });
      console.log(
        `── JA nikita — ${jaInstall.titles} titres, ${jaInstall.faces} faces (unmatched ${jaInstall.unmatched.length})`,
      );
      return {
        prints: dbzcFaces.prints,
        titles: dbzcFaces.titles + jaInstall.titles,
      };
    },
    seedProducts: () => {
      const sealed = ingestDbzcollectionSealedProducts({ argv });
      return sealed;
    },
  });
}
