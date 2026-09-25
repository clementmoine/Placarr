/**
 * Naruto Data Carddass pack extract — Catalogue Sync / worker (in-process).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import {
  harvestArcadeDataCarddass,
  installArcadeDataCarddassFaces,
} from "./arcadeGameCards";
import {
  harvestChitoroshopDataCarddassFaces,
  harvestNaoYoshiSeesaa,
  applyNaoYoshiSeesaaToChecklist,
  harvestSurugaDcd,
  writeOfficialDataCarddassChecklist,
} from "./harvest";
import {
  installDataCarddassChitoroshopFaces,
  installDataCarddassEbayFaces,
  installDataCarddassFrilFaces,
  installDataCarddassMercariFaces,
  installDataCarddassReconstructedFaces,
  installDataCarddassSurugaFaces,
  installDataCarddassTvTokyoFaces,
  settleDataCarddassFaces,
} from "./install/faces";
import {
  NARUTO_DATA_CARDDASS_PACK_ID,
  narutoDataCarddassCuratedDir,
} from "./pack";
import { buildDataCarddassFromLedgers } from "./pipeline/ledgers";
import { mergeSurugaHtmlFileIntoListingsTsv } from "./pipeline/surugaPaste";
import { ingestDataCarddassSealedProducts } from "./sealed";

export async function runNarutoDataCarddassPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const skipArcade = argv.includes("--skip-arcade");
  const crawlChito = argv.includes("--crawl-chito");
  if (!skipArcade) {
    try {
      const arcade = await harvestArcadeDataCarddass({ force });
      console.log(
        `── arcadegamecards DCD — ${arcade.cards} fiche(s) : ${arcade.ok} JPEG, ${arcade.skip} déjà là, ${arcade.fail} manqué${arcade.fail === 1 ? "" : "s"}`,
      );
    } catch (err) {
      console.warn(
        `── arcadegamecards DCD — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  if (crawlChito) {
    try {
      const chitoHarvest = await harvestChitoroshopDataCarddassFaces();
      console.log(
        `── Chitoroshop crawl — ${chitoHarvest.products} produits → ${chitoHarvest.faces} faces → ${chitoHarvest.path}`,
      );
    } catch (err) {
      console.warn(
        `── Chitoroshop crawl — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  const crawlSuruga = argv.includes("--crawl-suruga");
  if (crawlSuruga) {
    try {
      await harvestSurugaDcd();
    } catch (err) {
      console.warn(
        `── Suruga crawl — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  const surugaHtml = (() => {
    const i = argv.indexOf("--merge-suruga-html");
    return i >= 0 ? argv[i + 1] : undefined;
  })();
  if (surugaHtml) {
    try {
      const merged = mergeSurugaHtmlFileIntoListingsTsv(surugaHtml);
      console.log(
        `── Suruga paste — ${merged.added} ajouté(s) (${merged.before}→${merged.after}) → ${merged.path}`,
      );
    } catch (err) {
      console.warn(
        `── Suruga paste — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  try {
    const assembled = writeOfficialDataCarddassChecklist();
    console.log(
      `── Data Carddass checklist — ${assembled.cards.length} fiche(s) (${Object.entries(
        assembled.byPrefix,
      )
        .map(([k, v]) => `${k}:${v}`)
        .join(", ")})`,
    );
  } catch (err) {
    console.warn(
      `── Data Carddass checklist — échec : ${err instanceof Error ? err.message : err}`,
    );
  }
  try {
    const forceSeesaa = argv.includes("--force-seesaa") || force;
    const ledger = await harvestNaoYoshiSeesaa({ force: forceSeesaa });
    const applied = applyNaoYoshiSeesaaToChecklist({ ledger });
    console.log(
      `── nao-yoshi Seesaa — ${ledger.rows.length} refs : ${applied.nameFixed} nom(s), ${applied.raritySet} rareté(s)`,
    );
  } catch (err) {
    console.warn(
      `── nao-yoshi Seesaa — échec : ${err instanceof Error ? err.message : err}`,
    );
  }
  return runLocalTcgPipeline({
    packId: NARUTO_DATA_CARDDASS_PACK_ID,
    curatedDir: narutoDataCarddassCuratedDir(),
    label: "Naruto Data Carddass",
    seed: async (index) => {
      const built = buildDataCarddassFromLedgers({ index });
      if (built.skipped.length) {
        console.log(
          `── Data Carddass — ${built.skipped.length} écartée(s) : ${built.skipped.join(", ")}`,
        );
      }
      const tvtokyo = await installDataCarddassTvTokyoFaces({ index, force });
      if (
        tvtokyo.written.length ||
        tvtokyo.skipped.length ||
        tvtokyo.failed.length
      ) {
        console.log(
          `── Data Carddass TV Tokyo : ${tvtokyo.written.length} écrits, ${tvtokyo.skipped.length} sautés, ${tvtokyo.failed.length} échecs`,
        );
      }
      const suruga = await installDataCarddassSurugaFaces({ index });
      if (
        suruga.written.length ||
        suruga.skipped.length ||
        suruga.failed.length
      ) {
        console.log(
          `── Data Carddass Suruga : ${suruga.listed} listés, ${suruga.written.length} écrits, ${suruga.skipped.length} sautés, ${suruga.failed.length} échecs`,
        );
      }
      const chito = await installDataCarddassChitoroshopFaces({ index });
      if (
        chito.written.length ||
        chito.skipped.length ||
        chito.failed.length
      ) {
        console.log(
          `── Data Carddass Chitoroshop : ${chito.written.length} écrits, ${chito.skipped.length} sautés, ${chito.failed.length} échecs`,
        );
      }
      const mercari = await installDataCarddassMercariFaces({ index, force });
      if (
        mercari.written.length ||
        mercari.skipped.length ||
        mercari.failed.length
      ) {
        console.log(
          `── Data Carddass Mercari : ${mercari.written.length} écrits, ${mercari.skipped.length} sautés, ${mercari.failed.length} échecs`,
        );
      }
      const fril = await installDataCarddassFrilFaces({ index, force });
      if (fril.written.length || fril.skipped.length || fril.failed.length) {
        console.log(
          `── Data Carddass Fril : ${fril.written.length} écrits, ${fril.skipped.length} sautés, ${fril.failed.length} échecs`,
        );
      }
      const faces = await installDataCarddassEbayFaces({ index });
      if (
        faces.written.length ||
        faces.skipped.length ||
        faces.failed.length
      ) {
        console.log(
          `── Data Carddass eBay : ${faces.written.length} écrits, ${faces.skipped.length} sautés, ${faces.failed.length} échecs`,
        );
      }
      const reconstructed = await installDataCarddassReconstructedFaces({
        index,
        force,
      });
      if (
        reconstructed.written.length ||
        reconstructed.skipped.length ||
        reconstructed.failed.length
      ) {
        console.log(
          `── Data Carddass reconstructed : ${reconstructed.written.length} écrits, ${reconstructed.skipped.length} sautés, ${reconstructed.failed.length} échecs`,
        );
      }
      const arcadeFaces = installArcadeDataCarddassFaces();
      if (arcadeFaces.faces || arcadeFaces.missing.length) {
        console.log(
          `── Data Carddass arcade : ${arcadeFaces.faces} face(s)${arcadeFaces.missing.length ? `, ${arcadeFaces.missing.length} manquante(s)` : ""}`,
        );
      }
      const settled = await settleDataCarddassFaces({ index });
      if (settled.settled) {
        console.log(
          `── Data Carddass faceChoice : ${settled.settled} face(s) tranchée(s), ${settled.assets} index`,
        );
      }
      return { prints: built.prints, titles: built.titles };
    },
    seedProducts: async () => ingestDataCarddassSealedProducts(),
  });
}

const isDirectCli =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectCli) {
  runNarutoDataCarddassPackPipeline(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
