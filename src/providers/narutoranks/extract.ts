/**
 * Naruto Ninja Ranks pack extract — Catalogue Sync / worker (in-process).
 */
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import {
  harvestArcadeGameCards,
  installArcadeGameCards,
} from "./arcadeGameCards";
import {
  harvestAnimeCollectionRanksFaces,
  installAnimeCollectionRanksFaces,
} from "./animecollectionFaces";
import { syncEbayNinjaRanksFromBrowseApi } from "./ebayAssets";
import {
  buildNinjaRanksFromLedgers,
  buildEuropeanNsFromLedger,
  buildSupplementalPromosFromLedger,
} from "./buildFromLedgers";
import { buildFrenchNinjaRanksTitles } from "./frenchTitles";
import {
  harvestColekaNinjaRanks,
  installColekaNinjaRanks,
} from "./colekaNinjaRanks";
import { harvestImadokiSheets, installImadokiSheets } from "./imadokiSheets";
import {
  harvestInkworksOfficialAssets,
  installInkworksSampleFaces,
} from "./inkworksOfficial";
import { ingestNinjaRanksSealedProducts } from "./paniniEuProducts";
import {
  harvestBloggerPackRip,
  installBloggerPackRip,
} from "./unofficialVisuals";
import { installReconstructedFaces } from "./installReconstructedFaces";
import { NARUTO_RANKS_PACK_ID, narutoRanksCuratedDir } from "./pack";
import { enrichCardsIndexArtDimensions } from "@/providers/shared/cardCatalogue/enrichCardsIndexArtDimensions";

export async function runNarutoRanksPackPipeline(
  argv: readonly string[] = [],
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
  const coleka = await harvestColekaNinjaRanks({ force });
  console.log(
    `── Coleka — ${coleka.pages} page(s) lue(s), ${coleka.cards} carte(s) retenue(s) : ${coleka.ok} recto, ${coleka.backOk} verso, ${coleka.skip + coleka.backSkip} déjà là, ${coleka.fail + coleka.backFail} manqué${coleka.fail + coleka.backFail === 1 ? "" : "s"}`,
  );
  const ebay = await syncEbayNinjaRanksFromBrowseApi({ force });
  if (ebay.fetched || ebay.expired.length || ebay.images) {
    console.log(
      `── eBay Browse — ${ebay.fetched} annonce(s) lue(s), ${ebay.images} JPEG staging, ${ebay.expired.length} expirée${ebay.expired.length === 1 ? "" : "s"} (API, pas de scrape)`,
    );
  }
  if (coleka.rejected.length) {
    console.log(
      `── Coleka — ${coleka.rejected.length} fiche(s) refusée(s) : ${coleka.rejected
        .slice(0, 4)
        .map((r) => `${r.ref} (${r.reason.slice(0, 48)}…)`)
        .join(", ")}`,
    );
  }
  const arcade = await harvestArcadeGameCards({ force });
  console.log(
    `── arcadegamecards — ${arcade.pages} page(s), ${arcade.cards} carte(s) retenue(s) : ${arcade.ok} recto, ${arcade.backOk} verso, ${arcade.skip + arcade.backSkip} déjà là, ${arcade.fail + arcade.backFail} manqué${arcade.fail + arcade.backFail === 1 ? "" : "s"}`,
  );
  if (arcade.rejected.length) {
    console.log(
      `── arcadegamecards — ${arcade.rejected.length} fiche(s) refusée(s) : ${arcade.rejected
        .map(
          (r: { printed: string; reason: string }) =>
            `${r.printed} (${r.reason.slice(0, 44)}…)`,
        )
        .join(", ")}`,
    );
  }
  const ac = await harvestAnimeCollectionRanksFaces({
    force,
    refreshLedger: true,
  });
  console.log(
    `── AnimeCollection — ${ac.cards} carte(s) : ${ac.ok} recto, ${ac.backsOk} verso, ${ac.skip + ac.backsSkip} déjà là, ${ac.fail + ac.backsFail} manqué${ac.fail + ac.backsFail === 1 ? "" : "s"}`,
  );
  const imadoki = await harvestImadokiSheets({ force });
  console.log(
    `── Imadoki — ${imadoki.ok} planche(s), ${imadoki.skip} déjà là, ${imadoki.fail} manquée${imadoki.fail === 1 ? "" : "s"}`,
  );
  // Le semis rend l'index ; la découpe des planches, asynchrone, s'en ressert
  // juste après.
  let seeded:
    | Parameters<
        NonNullable<Parameters<typeof runLocalTcgPipeline>[0]["seed"]>
      >[0]
    | null = null;
  return runLocalTcgPipeline({
    packId: NARUTO_RANKS_PACK_ID,
    curatedDir: narutoRanksCuratedDir(),
    label: "Naruto Ninja Ranks",
    seed: (index) => {
      seeded = index;
      const report = buildNinjaRanksFromLedgers({ index });
      const ns = buildEuropeanNsFromLedger({ index });
      const promos = buildSupplementalPromosFromLedger({ index });
      const french = buildFrenchNinjaRanksTitles({ index });
      if (french.titles || french.sharedFromEnglish) {
        console.log(
          `── Naruto Ninja Ranks — ${french.titles} titre(s) localisés attestés, ${french.sharedFromEnglish} nom(s) partagés depuis l'EN${french.missing.length ? ` (${french.missing.length} trou${french.missing.length === 1 ? "" : "s"} sans attestation)` : ""}`,
        );
      }
      const faces = installInkworksSampleFaces(index);
      if (faces.installed) {
        console.log(
          `── Naruto Ninja Ranks — ${faces.installed} face${faces.installed === 1 ? "" : "s"} échantillon`,
        );
      }
      const usa = installArcadeGameCards(index);
      if (usa.faces || usa.backs) {
        console.log(
          `── Naruto Ninja Ranks — ${usa.faces} face(s) américaine(s), ${usa.backs} verso(s)`,
        );
      }
      const scans = installColekaNinjaRanks(index);
      if (scans.faces || scans.backs || scans.missing.length) {
        console.log(
          `── Naruto Ninja Ranks — ${scans.faces} face(s) Coleka, ${scans.backs} verso(s)${scans.missing.length ? `, ${scans.missing.length} sans octets en staging` : ""}`,
        );
      }
      // AC après Coleka : writeAssets écrase le pointeur d'index — AC est la
      // source FR principale (HD + dos).
      const acFaces = installAnimeCollectionRanksFaces(index);
      if (acFaces.faces || acFaces.backs || acFaces.missing.length) {
        console.log(
          `── Naruto Ninja Ranks — ${acFaces.faces} face(s) AnimeCollection, ${acFaces.backs} verso(s)${acFaces.missing.length ? `, ${acFaces.missing.length} manquante(s)` : ""}`,
        );
      }
      const fan = installBloggerPackRip(index);
      if (fan.cards || fan.products || fan.backs) {
        console.log(
          `── Naruto Ninja Ranks — dumps fan : ${fan.cards} face, ${fan.backs} verso, ${fan.products} packshot`,
        );
      }
      return {
        rows: report.rows + ns.rows + promos.rows,
        prints: report.prints + ns.prints + promos.prints,
        titles: report.titles + ns.titles + promos.titles,
        skipped: [...report.skipped, ...ns.skipped, ...promos.skipped],
      };
    },
    seedProducts: async () => {
      /*
        Les planches se découpent après le semis : `seed` est synchrone, et
        `sharp` ne l'est pas. L'index est le même, et `exportIndex` a déjà
        tourné — d'où la seconde passe ci-dessous.
      */
      const reconstructed = seeded
        ? await installReconstructedFaces(seeded, { force })
        : { faces: 0, backs: 0, skipped: [], unattested: [] };
      if (reconstructed.faces || reconstructed.backs) {
        console.log(
          `── Naruto Ninja Ranks — ${reconstructed.faces} face(s) reconstruite(s), ${reconstructed.backs} verso(s)${reconstructed.skipped.length ? `, ${reconstructed.skipped.length} sans source curée` : ""}`,
        );
      }
      if (reconstructed.unattested.length) {
        console.warn(
          `   ${reconstructed.unattested.length} face(s) installée(s) sans ligne dans reconstructed-faces.json : ${reconstructed.unattested.join(", ")}`,
        );
      }
      if ((reconstructed.faces || reconstructed.backs) && seeded) {
        seeded.exportIndex();
        const dims = await enrichCardsIndexArtDimensions(NARUTO_RANKS_PACK_ID);
        if (dims.probed) {
          console.log(
            `── Naruto Ninja Ranks — ${dims.probed} face(s) re-dimensionnée(s) après scans curés`,
          );
        }
      }
      const cut = seeded
        ? await installImadokiSheets(seeded)
        : { faces: 0, sheets: 0, rejected: [] };
      if (cut.faces || cut.rejected.length) {
        console.log(
          `── Naruto Ninja Ranks — ${cut.faces} face(s) italienne(s) sur ${cut.sheets} planche(s)${cut.rejected.length ? `, ${cut.rejected.length} case(s) refusée(s)` : ""}`,
        );
      }
      if (cut.faces && seeded) {
        seeded.exportIndex();
        const dims = await enrichCardsIndexArtDimensions(NARUTO_RANKS_PACK_ID);
        if (dims.probed) {
          console.log(
            `── Naruto Ninja Ranks — ${dims.probed} face(s) re-dimensionnée(s) après Imadoki`,
          );
        }
      }
      return ingestNinjaRanksSealedProducts();
    },
  });
}
