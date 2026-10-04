/**
 * Dragon Ball JCC (Bandai France 2005-2009) pack extract — Catalogue Sync / worker (in-process).
 *
 * Source : dbzcollection.fr (12 parts, 1 398 cartes, 46 packagings) +
 * carddass.fr/dbz Wayback (FR faces) + nikita DBC (JA titres partiels) +
 * Chitoroshop (JA faces / titres EN) + Hatatoy (JA faces / titres JA) +
 * DeckCardMania (fiches set FR : packshots / rares-holos / samples nommés) +
 * packshots presse / retail (manga-sanctuary, coleka, DCM, fnac, …).
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";
import {
  packCatalogIngestLedgerPath,
  recordCatalogPromoteAndPurgeStaging,
} from "@/providers/shared/catalogIngestLedger";
import { installProviderProductsContents } from "@/providers/shared/sealedProducts/curatedContents";

import {
  dbzcollectionStagingDir,
  harvestDbzcollection,
  ingestDbzcollectionSealedProducts,
  installDbzcollectionFaces,
  jccDbzcollectionContentHash,
} from "./scrape/dbzcollection";
import { harvestCarddassFrDbz } from "./harvest/carddassFr";
import { harvestDbsJccChitoroshopFaces } from "./harvest/chitoroshop";
import { harvestDbsJccDeckcardmania } from "./harvest/deckcardmania";
import { harvestDbsJccHatatoyFaces } from "./harvest/hatatoy";
import { harvestAndInstallDbsJccNikitaBacks } from "./harvest/nikitaBack";
import { harvestDbsJccJaFromNikita } from "./harvest/nikitaDbc";
import { installDbsJccCarddassFr } from "./install/carddassFr";
import { installDbsJccChitoroshopJa } from "./install/chitoroshopJa";
import { installDbsJccDeckcardmania } from "./install/deckcardmania";
import { installDbsJccHatatoyJa } from "./install/hatatoyJa";
import { harvestDbzcollectionContents } from "./harvest/dbzcollectionContents";
import { harvestDbzcollectionPouvoirs } from "./harvest/dbzcollectionPouvoirs";
import { applyDbsjccPouvoirGroupings } from "./install/applyPouvoirGroupings";
import { dedupeDbsjccPrintSets } from "./install/dedupePrintSets";
import { installDbsjccDetecteur } from "./install/detecteur";
import { installDbsjccDeckPosters } from "./install/deckPosters";
import { installDbsJccPressPackshots } from "./install/pressPackshots";
import { writeSealedContentsFromDbzc } from "./install/sealedContentsFromDbzc";
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
  console.log(
    `── carddass.fr pouvoirs — ${frOfficial.pouvoirMarkers} marqueur(s) PA/PB/vc → ${frOfficial.pouvoirMarkersPath}`,
  );
  const dbzcPouvoirs = await harvestDbzcollectionPouvoirs({ force });
  console.log(
    `── dbzcollection pouvoirs — ${dbzcPouvoirs.withPouvoir}/${dbzcPouvoirs.listed} → ${dbzcPouvoirs.path}`,
  );
  if (argv.includes("--names") || argv.includes("--harvest-names")) {
    const { harvestCarddassFrDbzNames } = await import(
      /* webpackIgnore: true */
      "./harvest/carddassFrNames"
    );
    const { harvestDbzcollectionNames } = await import(
      /* webpackIgnore: true */
      "./harvest/dbzcollectionNames"
    );
    const frNames = await harvestCarddassFrDbzNames();
    console.log(`── carddass.fr names — ${frNames.names} → ${frNames.path}`);
    const dbzcNames = await harvestDbzcollectionNames();
    console.log(
      `── dbzcollection names — ${dbzcNames.named} Nom, ${dbzcNames.missingNom} sans → ${dbzcNames.path}`,
    );
  }
  // carddass.com DBC: live /dbc|/dbz|/cardgame = 404; CDX no Card Game face dump
  // (dbh = Heroes, other pack). JA faces = nikita + shops — see curated/BACK.md.
  console.log(
    "── carddass.com DBC JA — pas de dump faces utilisable (voir curated/BACK.md)",
  );

  const ja = await harvestDbsJccJaFromNikita();
  console.log(`── nikita DBC JA — ${ja.cards.length} titre(s) → ${ja.outPath}`);

  const chitoro = await harvestDbsJccChitoroshopFaces();
  console.log(
    `── chitoroshop DBC JA — ${chitoro.faces} face(s) / ${chitoro.products} produit(s) → ${chitoro.path}`,
  );

  const hatatoy = await harvestDbsJccHatatoyFaces();
  console.log(
    `── hatatoy DBC JA — ${hatatoy.faces} face(s) / ${hatatoy.products} produit(s) → ${hatatoy.path}`,
  );

  const dcm = await harvestDbsJccDeckcardmania();
  console.log(
    `── deckcardmania fiches — ${dcm.albums} album(s), ${dcm.rares} rare(s), ${dcm.holos} holo(s), ${dcm.named} sample(s) → ${dcm.path}`,
  );

  if (!skipFaces) {
    const backs = await harvestAndInstallDbsJccNikitaBacks({ force });
    console.log(
      `── nikita DBC back EN/JA — ${backs.downloaded ? "téléchargé" : "curated"}, ${backs.installed} webp installé(s)`,
    );
  }

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
      const dedupe = await dedupeDbsjccPrintSets(DBS_JCC_PACK_ID);
      console.log(
        `── dedupe print_sets — ${dedupe.canonical} canonique(s), ${dedupe.aliasesRemoved} alias retiré(s), ${dedupe.printSets} membership(s), items ${dedupe.itemsRemapped}, contents ${dedupe.productsRemapped}`,
      );
      const pouvoirs = await applyDbsjccPouvoirGroupings(DBS_JCC_PACK_ID);
      console.log(
        `── pouvoirs groupings — ${pouvoirs.remapped} remap(s), skip ${pouvoirs.skipped}, items ${pouvoirs.itemsRemapped}, aliases +${pouvoirs.aliasesAdded}`,
      );
      const carddassFr = await installDbsJccCarddassFr(index, {
        downloadFaces: !skipFaces,
      });
      console.log(
        `── FR carddass.fr — listed ${carddassFr.listed}, candidates ${carddassFr.candidates}, matched ${carddassFr.matched}, faces ${carddassFr.faces}, failed ${carddassFr.failed} (skip ${carddassFr.skipped.length})`,
      );
      const jaInstall = await installDbsJccJaTitles(index, {
        downloadFaces: !skipFaces,
      });
      console.log(
        `── JA nikita — ${jaInstall.titles} titres, ${jaInstall.faces} faces (unmatched ${jaInstall.unmatched.length})`,
      );
      const detecteur = await installDbsjccDetecteur({ force });
      console.log(
        `── Détecteur — print ${detecteur.print ? "ok" : "ko"}, FR ${detecteur.faceFr ? "ok" : "—"}, JA ${detecteur.faceJa ? "ok" : "—"}, ${detecteur.purgedSealed} SKU scellé(s) retiré(s)`,
      );
      const chitoroInstall = await installDbsJccChitoroshopJa(index, {
        downloadFaces: !skipFaces,
      });
      console.log(
        `── JA chitoroshop — listed ${chitoroInstall.listed}, matched ${chitoroInstall.matched}, minted ${chitoroInstall.minted}, titles ${chitoroInstall.titles}, faces ${chitoroInstall.faces} (skip ${chitoroInstall.skipped.length})`,
      );
      const hatatoyInstall = await installDbsJccHatatoyJa(index, {
        downloadFaces: !skipFaces,
      });
      console.log(
        `── JA hatatoy — listed ${hatatoyInstall.listed}, matched ${hatatoyInstall.matched}, minted ${hatatoyInstall.minted}, titles ${hatatoyInstall.titles}, faces ${hatatoyInstall.faces} (skip ${hatatoyInstall.skipped.length})`,
      );
      const dcmInstall = await installDbsJccDeckcardmania(index, {
        downloadFaces: !skipFaces,
        force,
      });
      console.log(
        `── FR deckcardmania — packshots installed ${dcmInstall.packshots.packshotsInstalled} (dl ${dcmInstall.packshots.packshotsDownloaded}, staging-only ${dcmInstall.packshots.stagedOnly}), rarity stamped ${dcmInstall.rarity.stamped}/${dcmInstall.rarity.listed}, faces ${dcmInstall.faces.faces} matched ${dcmInstall.faces.matched} (skip ${dcmInstall.faces.skipped.length})`,
      );
      return {
        prints:
          dbzcFaces.prints + chitoroInstall.minted + hatatoyInstall.minted,
        titles:
          dbzcFaces.titles +
          jaInstall.titles +
          chitoroInstall.titles +
          hatatoyInstall.titles,
      };
    },
    seedProducts: async () => {
      const sealed = ingestDbzcollectionSealedProducts({ argv });
      const staging = dbzcollectionStagingDir();
      if (!force && existsSync(staging)) {
        recordCatalogPromoteAndPurgeStaging({
          ledgerPath: packCatalogIngestLedgerPath(DBS_JCC_PACK_ID),
          artefactId: "jcc:dbzcollection",
          contentHash: jccDbzcollectionContentHash(),
          stagingPath: staging,
        });
        console.log("── dbzc staging — purgé (ledger frais)");
      }
      const press = await installDbsJccPressPackshots({ force });
      console.log(
        `── press packshots — ${press.installed} installé(s), ${press.renamed} renommé(s), ${press.minted} créé(s), ${press.failed} échec(s)`,
      );
      const contents = await harvestDbzcollectionContents({ force, argv });
      console.log(
        `── dbzc contents — ${contents.cards} carte(s) → ${contents.path}`,
      );
      const sealedLists = writeSealedContentsFromDbzc();
      console.log(
        `── sealed lists — ${sealedLists.decks} deck(s), ${sealedLists.prints} garantie(s), ${sealedLists.boosters} booster pool(s)`,
      );
      const posters = installDbsjccDeckPosters();
      console.log(
        `── deck posters — ${posters.attached} attaché(s), ${posters.purged} SKU retiré(s)${posters.missing.length ? `, manquant: ${posters.missing.join(", ")}` : ""}`,
      );
      return sealed;
    },
  });
}
