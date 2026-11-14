/**
 * Dragon Ball Super Card Game (Masters) — Bandai FR+EN cardlists, local index.
 * Provider id `dbscg`; printKey game slug `dbscg`. Fusion World is `dbsfw`.
 */
import { catalogAliasesFromNames } from "@/core/enrich/aliases";
import { SKU_KEY_MERGE_KEY } from "@/core/enrich/internalMergeKeys";
import { parsePrintKey } from "@/core/identify/printKey";
import { createDbsCatalogModule } from "@/providers/dragonball/shared/dbs/createDbsCatalogModule";
import { buildCatalogueDiskFaceAttachments } from "@/providers/shared/cardCatalogue/catalogueDiskFaceAttachments";
import type { MetadataResult } from "@/types/metadataProvider";
import type { MetadataAdapterContext } from "@/types/providerModule";

import { dbsCgPrintFacts } from "./facts";
import {
  DBS_CG_PACK_ID,
  dbsCgCardFolder,
  dbsCgDbPath,
  dbsCgLocalArtFilename,
  ensureDbsCgIndex,
  listDbsCgPrintSets,
} from "./indexStore";
import { dbscgCatalog } from "./pipeline";
import { DBS_CG_GAME } from "./identity";
import {
  lookupDbsCgPrint,
  lookupDbsCgPrintDetail,
  searchDbsCgPrints,
} from "./search";
import dbscgBoosterComposition from "./curated/booster-composition.json";
import type { BoosterCompositionFile } from "@/providers/shared/sealedProducts/boosterComposition";
import {
  dbsCgDigPrintFacts,
  dbsCgSealedMetadataResult,
} from "./sources/digCitations";

const PROVIDER_ID = "dbscg";
const PROVIDER_LABEL = "Dragon Ball Super Card Game";

const PROBE_PRINT_KEY = "dbscg:bt1-001";
const PROBE_CARD_NAME = "Champa";

function resolveFromLocal(ctx: MetadataAdapterContext): MetadataResult | null {
  const skuKey = ctx.externalIds?.[SKU_KEY_MERGE_KEY]?.trim() || "";
  if (skuKey) {
    const sealed = dbsCgSealedMetadataResult(skuKey, PROVIDER_ID);
    if (sealed) return sealed;
  }

  const printKey =
    ctx.printKey?.trim() || ctx.externalIds?.printKey?.trim() || "";
  if (!printKey) return null;
  if (parsePrintKey(printKey)?.game !== DBS_CG_GAME) return null;
  if (!ensureDbsCgIndex()) return null;
  const row = lookupDbsCgPrintDetail(printKey);
  if (!row) return null;
  const title = row.fullName?.trim();
  if (!title) return null;

  const otherLang = row.lang.toLowerCase() === "en" ? "fr" : "en";
  const other = lookupDbsCgPrintDetail(printKey, { language: otherLang });
  const aliases = catalogAliasesFromNames(title, [
    row.awakenedName,
    row.character,
    other?.fullName,
    other?.awakenedName,
    other?.character,
  ]);

  const lang = (row.lang || "fr").toLowerCase();
  const diskId = {
    set: row.setCode.trim().toLowerCase(),
    lang,
    card: dbsCgCardFolder(row),
  };
  const preferredArt = dbsCgLocalArtFilename(row, lang);
  const diskFaces = buildCatalogueDiskFaceAttachments({
    packId: DBS_CG_PACK_ID,
    diskId,
    preferredArt,
    providerId: PROVIDER_ID,
    printGame: DBS_CG_GAME,
    title,
  });
  const imageUrl = diskFaces.defaultUrl ?? row.imageUrl ?? undefined;

  return {
    title,
    ...(imageUrl ? { imageUrl } : {}),
    ...(diskFaces.attachments.length
      ? { attachments: diskFaces.attachments }
      : {}),
    ...(aliases?.length ? { aliases } : {}),
    facts: [
      ...dbsCgPrintFacts(row, PROVIDER_ID),
      ...dbsCgDigPrintFacts(printKey, PROVIDER_ID),
    ],
    externalIds: {
      [PROVIDER_ID]: printKey,
      printKey,
    },
  };
}

export const dbscgModule = createDbsCatalogModule({
  providerId: PROVIDER_ID,
  providerLabel: PROVIDER_LABEL,
  catalogueLabel: "Dragon Ball Masters",
  factLabel: "DBS CG",
  printGame: DBS_CG_GAME,
  defaultLanguage: "fr",
  websiteUrl: "https://www.dbs-cardgame.com/europe-fr/cartes/",
  notes:
    "Masters (cardlists Bandai europe-fr + us-en) → `data/dragonball/cg/`. Noms FR et EN dans l’index. Jetons TK (ex. Jeton Ombre) depuis dbscards — absents du site Bandai. Faces Deckplanet EN / dbscards FR au sync, SAMPLE Bandai en fallback. Dos sleeve dbscards. Sync : Catalogue Extract (admin / worker). Fusion World = module `dbsfw`.",
  syncHint: "Catalogue Sync (admin)",
  probePrintKey: PROBE_PRINT_KEY,
  probeCardName: PROBE_CARD_NAME,
  catalog: dbscgCatalog,
  dbPath: dbsCgDbPath,
  ensureIndex: ensureDbsCgIndex,
  listPrintSets: listDbsCgPrintSets,
  searchPrints: searchDbsCgPrints,
  lookupPrint: lookupDbsCgPrint,
  lookupDetail: lookupDbsCgPrintDetail,
  resolveMetadata: resolveFromLocal,
  loadBoosterComposition: () => {
    const raw = dbscgBoosterComposition as BoosterCompositionFile;
    return raw?.version === 1 ? raw : null;
  },
});

export { dbsCgDbPath, ensureDbsCgIndex, writeDbsCgIndex } from "./indexStore";
