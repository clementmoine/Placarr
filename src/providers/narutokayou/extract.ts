/**
 * Naruto Kayou pack extract — Catalogue Sync / worker (in-process).
 *
 * Orientation: probe pixels in the shared pipeline, then
 * `markKayouRotatedLandscapePrints` for NRZ08-style HR/MR (186×264 scans of
 * physical landscape cards). Do **not** mark 320×450 lenticular strips.
 */
import path from "node:path";

import { packCardsDir } from "@/lib/packPaths";
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { buildKayouFromLedgers } from "./buildFromLedgers";
import { markKayouRotatedLandscapePrints } from "./landscapePrints";
import { markKayouLenticularGrids } from "./lenticularGrid";
import { purgeKayouAliasPrints } from "./purgeKayouAliasPrints";
import { relocateKayouAliasFaceDirs } from "./relocateKayouAliasFaceDirs";
import { harvestKayouOfficialTierBacks } from "./kayouOfficialBacks";
import {
  readKayouOfficialCatalog,
  runKayouOfficialCatalogCrawl,
} from "./kayouOfficialCrawl";
import { runKayouExternalCatalogCrawl } from "./kayouExternalCrawl";
import { ingestKayouOfficialSealedProducts } from "./kayouOfficialSealedProducts";
import { installKayouOfficialCardBacks } from "./installOfficialCardBacks";
import { harvestKayouFaces, installKayouFaces } from "./narutocardsFaces";
import {
  crawlNarutodbKayouChecklist,
  harvestNarutodbMissingCardBacks,
} from "./narutodbCrawl";
import { NARUTO_KAYOU_PACK_ID, narutoKayouCuratedDir } from "./pack";
import {
  harvestGgArchiveCards,
  harvestGgArchivePrices,
} from "@/providers/shared/naruto/ggArchiveHarvest";

export async function runNarutoKayouPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const skipFaces = argv.includes("--titles-only");
  const skipOfficial = argv.includes("--skip-official");
  const skipBacks = argv.includes("--skip-backs");
  const skipExternal = argv.includes("--skip-external");
  const skipGg = argv.includes("--skip-gg");
  const skipNarutodb = argv.includes("--skip-narutodb");
  if (!skipGg) {
    try {
      const gg = await harvestGgArchiveCards({
        packId: NARUTO_KAYOU_PACK_ID,
        line: "kayou",
      });
      console.log(`── narutocardgame.gg kayou — ${gg.cards} carte(s) indexées`);
      const prices = await harvestGgArchivePrices({
        packId: NARUTO_KAYOU_PACK_ID,
        line: "kayou",
      });
      console.log(`── narutocardgame.gg kayou prices — ${prices.rows} ligne(s)`);
    } catch (err) {
      console.warn(
        `── narutocardgame.gg kayou — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  if (!skipExternal) {
    const ext = await runKayouExternalCatalogCrawl();
    console.log(
      `── capsulecorpgear — ${ext.capsulecorp.sets} set(s), ${ext.capsulecorp.cards} carte(s)${ext.capsulecorp.changed ? ", manifest mis à jour" : ", inchangé"}`,
    );
    console.log(
      `── alertehit narutodex — ${ext.alertehit.images} image(s) hitmarket${ext.alertehit.changed ? ", index mis à jour" : ", inchangé"}`,
    );
  }
  if (!skipNarutodb) {
    try {
      const crawled = await crawlNarutodbKayouChecklist({
        onProgress: (m) => console.log(`   narutodb — ${m}`),
      });
      console.log(
        `── narutodb.com checklist — ${crawled.cards} carte(s) / ${crawled.sets} set(s)${crawled.changed ? ", mis à jour" : ", inchangé"}`,
      );
    } catch (err) {
      console.warn(
        `── narutodb.com checklist — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  if (!skipOfficial) {
    const crawl = await runKayouOfficialCatalogCrawl();
    console.log(
      `── kayouofficial crawl — ${crawl.series} série(s), ${crawl.cards} carte(s)${crawl.changed ? ", manifest mis à jour" : ", inchangé"} (hash ${crawl.contentHash})`,
    );
  }
  if (!skipBacks) {
    const backs = await harvestKayouOfficialTierBacks({
      force,
      curatedCardsDir: path.join(narutoKayouCuratedDir(), "cards"),
      catalog: skipOfficial ? null : readKayouOfficialCatalog(),
    });
    console.log(
      `── kayouofficial backs — distinct [${backs.deduped.installed.join(", ") || "—"}], =défaut [${backs.deduped.skippedDefault.join(", ") || "—"}], conflits URL ${backs.conflicts}, CDN miss ${backs.fail} · per-card ${backs.perCardInstalled} new / ${backs.perCardSkipped} skip / ${backs.perCard} (${backs.cards} cartes / ${backs.series} séries)`,
    );
    const official = await installKayouOfficialCardBacks({
      destCardsDir: packCardsDir(NARUTO_KAYOU_PACK_ID),
      force,
      onProgress: (m) => console.log(`   kayou backs — ${m}`),
    });
    console.log(
      `── dos official — print ${official.print} / =tier ${official.tier} / =défaut ${official.defaulted} · ${official.installed} WebP new, ${official.skipped} skip`,
    );
    if (!skipNarutodb) {
      try {
        const ndbBacks = await harvestNarutodbMissingCardBacks({
          force,
          onProgress: (m) => console.log(`   narutodb backs — ${m}`),
        });
        console.log(
          `── narutodb.com backs — ${ndbBacks.installed} new / ${ndbBacks.skipped} skip / ${ndbBacks.fail} miss (${ndbBacks.probed} sondé(s))`,
        );
        const afterNdb = await installKayouOfficialCardBacks({
          destCardsDir: packCardsDir(NARUTO_KAYOU_PACK_ID),
          force,
          onProgress: (m) => console.log(`   kayou backs — ${m}`),
        });
        if (afterNdb.installed) {
          console.log(
            `── dos official (narutodb) — ${afterNdb.installed} WebP new · print ${afterNdb.print}`,
          );
        }
      } catch (err) {
        console.warn(
          `── narutodb.com backs — échec : ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
  if (!skipFaces) {
    console.log("── faces — harvest narutocards / CCG / alertehit…");
    const harvested = await harvestKayouFaces({
      force,
      onProgress: (m) => console.log(`   ${m}`),
    });
    console.log(
      `── narutocards.ca + CCG + alertehit faces — ${harvested.ok} WebP, ${harvested.skip} déjà là, ${harvested.fail} manqué${harvested.fail === 1 ? "" : "s"}`,
    );
  }
  return runLocalTcgPipeline({
    packId: NARUTO_KAYOU_PACK_ID,
    curatedDir: narutoKayouCuratedDir(),
    label: "Naruto Kayou",
    seed: (index) => {
      const built = buildKayouFromLedgers({ index });
      if (built.skipped.length) {
        console.log(
          `── Kayou — ${built.skipped.length} écartée(s)`,
        );
      }
      const purged = purgeKayouAliasPrints({ index });
      if (purged.migrated || purged.renamed) {
        console.log(
          `── Kayou alias — ${purged.migrated} fusionnée(s), ${purged.renamed} renommée(s)`,
        );
      }
      const relocated = relocateKayouAliasFaceDirs();
      if (relocated.renamed || relocated.merged || relocated.stagingRenamed) {
        console.log(
          `── Kayou faces alias — ${relocated.renamed} dossier(s) renommé(s), ${relocated.merged} fusionné(s), ${relocated.stagingRenamed} staging`,
        );
      }
      if (!skipFaces) {
        const faces = installKayouFaces(index);
        console.log(
          `── Faces — ${faces.faces} installée(s) (narutocards / capsulecorp / alertehit)${faces.missing.length ? `, manquant(s) ${faces.missing.length}` : ""}`,
        );
      }
      return { prints: built.prints, titles: built.titles };
    },
    seedProducts: async () => ingestKayouOfficialSealedProducts(),
  }).then(async (result) => {
    const rotated = markKayouRotatedLandscapePrints();
    if (rotated.marked || rotated.cleared) {
      console.log(
        `── Kayou paysage pivoté — ${rotated.marked} marquée(s)${rotated.cleared ? `, ${rotated.cleared} dé-flaguée(s)` : ""}`,
      );
    }
    const lenticular = await markKayouLenticularGrids(NARUTO_KAYOU_PACK_ID, {
      onProgress: (m) => console.log(`   ${m}`),
    });
    if (
      lenticular.marked ||
      lenticular.cleared ||
      lenticular.scanCropsMarked ||
      lenticular.scanCropsCleared
    ) {
      console.log(
        `── Kayou lenticulaire — ${lenticular.marked} grille(s)${lenticular.cleared ? `, ${lenticular.cleared} retirée(s)` : ""}; ${lenticular.scanCropsMarked} recadrage(s)${lenticular.scanCropsCleared ? `, ${lenticular.scanCropsCleared} retiré(s)` : ""} (${lenticular.probed} sondée(s)${lenticular.missingArt ? `, ${lenticular.missingArt} sans art` : ""})`,
      );
    }
    return result;
  });
}
