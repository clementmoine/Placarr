/**
 * Naruto Kayou pack extract — Catalogue Sync / worker (in-process).
 *
 * Orientation: probe pixels in the shared pipeline, then
 * `markKayouRotatedLandscapePrints` for NRZ08-style HR/MR (186×264 scans of
 * physical landscape cards). Do **not** mark 320×450 lenticular strips.
 *
 * STEPS (`--only` / `--skip` / `--offline`) : `seed` · `faces` · `products`.
 * `--titles-only` aliases `--skip faces`. Fine-grained `--skip-*` stay.
 */
import path from "node:path";

import { packCardsDir } from "@/lib/packPaths";
import {
  catalogueArgList,
  selectCatalogueSteps,
} from "@/providers/shared/cardCatalogue/catalogueSteps";
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import {
  harvestGgArchiveCards,
  harvestGgArchivePrices,
} from "@/providers/naruto/shared/gg/ggArchiveHarvest";

import { installKayouOfficialCardBacks } from "./install/officialCardBacks";
import { NARUTO_KAYOU_PACK_ID, narutoKayouCuratedDir } from "./pack";
import {
  markKayouLenticularGrids,
  markKayouRotatedLandscapePrints,
} from "./pipeline/lenticular";
import { buildKayouFromLedgers, readKayouChecklist } from "./pipeline/ledgers";
import { purgeKayouAliasPrints } from "./pipeline/purgeAliases";
import { relocateKayouAliasFaceDirs } from "./pipeline/relocateAliases";
import { ingestKayouOfficialSealedProducts } from "./sealed";
import {
  harvestKayouOfficialTierBacks,
  harvestNarutodbMissingCardBacks,
} from "./sources/backs";
import {
  crawlNarutodbKayouChecklist,
  readKayouOfficialCatalog,
  runKayouExternalCatalogCrawl,
  runKayouOfficialCatalogCrawl,
} from "./sources/crawl";
import { harvestKayouFaces, installKayouFaces } from "./sources/faces";

export const NARUTO_KAYOU_STEPS = ["seed", "faces", "products"] as const;
export type NarutoKayouStep = (typeof NARUTO_KAYOU_STEPS)[number];
/** Face CDN harvests are network; seed/crawl from local manifests still run. */
const NARUTO_KAYOU_ONLINE = new Set<NarutoKayouStep>(["faces"]);

export function selectNarutoKayouSteps(
  argv: readonly string[],
): NarutoKayouStep[] {
  return selectCatalogueSteps(withTitlesOnlyAlias(argv), NARUTO_KAYOU_STEPS, {
    online: NARUTO_KAYOU_ONLINE,
  });
}

function withTitlesOnlyAlias(argv: readonly string[]): readonly string[] {
  if (!argv.includes("--titles-only")) return argv;
  const skip = catalogueArgList(argv, "--skip");
  if (skip.includes("faces")) return argv.filter((t) => t !== "--titles-only");
  const next = argv.filter((t) => t !== "--titles-only");
  const idx = next.indexOf("--skip");
  if (idx >= 0 && next[idx + 1] && !next[idx + 1]!.startsWith("--")) {
    next[idx + 1] = `${next[idx + 1]},faces`;
    return next;
  }
  return [...next, "--skip", "faces"];
}

export async function runNarutoKayouPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const offline = argv.includes("--offline");
  const steps = selectNarutoKayouSteps(argv);
  console.log(
    `── Naruto Kayou — étapes : ${steps.join(" → ") || "(curated only)"}`,
  );

  const skipOfficial = argv.includes("--skip-official");
  const skipBacks = argv.includes("--skip-backs");
  const skipExternal = argv.includes("--skip-external");
  const skipGg = argv.includes("--skip-gg");
  const skipNarutodb = argv.includes("--skip-narutodb");
  const wantFaces = steps.includes("faces");

  if (steps.includes("seed")) {
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
        console.log(
          `── narutocardgame.gg kayou prices — ${prices.rows} ligne(s)`,
        );
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
      console.log(
        `── narutopia kayou — ${ext.narutopia.images} face(s) / ${ext.narutopia.pages} page(s)${ext.narutopia.changed ? ", index mis à jour" : ", inchangé"}`,
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
        // CDN tier sleeves → data/cards (URL-recoverable, not curated).
        curatedCardsDir: packCardsDir(NARUTO_KAYOU_PACK_ID),
        catalog: skipOfficial ? null : readKayouOfficialCatalog(),
      });
      console.log(
        `── kayouofficial backs — distinct [${backs.deduped.installed.join(", ") || "—"}], =défaut [${backs.deduped.skippedDefault.join(", ") || "—"}], conflits URL ${backs.conflicts}, CDN miss ${backs.fail} · per-card ${backs.perCardInstalled} new / ${backs.perCardSkipped} skip / ${backs.perCard} (${backs.cards} cartes / ${backs.series} séries)`,
      );
      const official = await installKayouOfficialCardBacks({
        curatedCardsDir: packCardsDir(NARUTO_KAYOU_PACK_ID),
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
            curatedCardsDir: packCardsDir(NARUTO_KAYOU_PACK_ID),
            onProgress: (m) => console.log(`   narutodb backs — ${m}`),
          });
          console.log(
            `── narutodb.com backs — ${ndbBacks.installed} new / ${ndbBacks.skipped} skip / ${ndbBacks.fail} miss (${ndbBacks.probed} sondé(s))`,
          );
          const afterNdb = await installKayouOfficialCardBacks({
            curatedCardsDir: packCardsDir(NARUTO_KAYOU_PACK_ID),
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
  }

  const checklist = readKayouChecklist();
  if (wantFaces && !offline) {
    console.log("── faces — harvest narutocards / CCG / alertehit…");
    const harvested = await harvestKayouFaces({
      checklist,
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
      let prints = 0;
      let titles = 0;
      if (steps.includes("seed")) {
        const built = buildKayouFromLedgers({ index });
        prints = built.prints;
        titles = built.titles;
        if (built.skipped.length) {
          console.log(`── Kayou — ${built.skipped.length} écartée(s)`);
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
      }
      if (wantFaces) {
        const faces = installKayouFaces(index, { checklist });
        console.log(
          `── Faces — ${faces.faces} installée(s) (narutocards / capsulecorp / alertehit)${faces.missing.length ? `, manquant(s) ${faces.missing.length}` : ""}`,
        );
      }
      return { prints, titles };
    },
    seedProducts: steps.includes("products")
      ? async () => ingestKayouOfficialSealedProducts()
      : undefined,
  }).then(async (result) => {
    if (!steps.includes("seed") && !wantFaces) return result;
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
