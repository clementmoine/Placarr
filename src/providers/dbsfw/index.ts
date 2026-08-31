/**
 * Dragon Ball Super Card Game Fusion World — Bandai fw/en cardlist, local index.
 * Provider id `dbsfw`; printKey game slug `dbsfw`. Masters is `dbscg`.
 */
import { parsePrintKey } from "@/core/identify/printKey";
import { createDbsCatalogModule } from "@/providers/shared/dbs/createDbsCatalogModule";
import type { MetadataResult } from "@/types/metadataProvider";
import type { MetadataAdapterContext } from "@/types/providerModule";

import { dbsFwPrintFacts } from "./facts";
import {
  dbsFwDbPath,
  ensureDbsFwIndex,
  listDbsFwPrintSets,
} from "./indexStore";
import { dbsfwCatalog } from "./pipeline";
import { DBS_FW_GAME } from "./printIdentity";
import {
  lookupDbsFwPrint,
  lookupDbsFwPrintDetail,
  searchDbsFwPrints,
} from "./searchPrints";
import dbsfwBoosterComposition from "./curated/booster-composition.json";
import type { BoosterCompositionFile } from "@/providers/shared/sealedProducts/boosterComposition";

const PROVIDER_ID = "dbsfw";
const PROVIDER_LABEL = "Dragon Ball Super Card Game Fusion World";

const PROBE_PRINT_KEY = "dbsfw:st01-001";
const PROBE_CARD_NAME = "Son Goten";

function resolveFromLocal(ctx: MetadataAdapterContext): MetadataResult | null {
  const printKey =
    ctx.printKey?.trim() || ctx.externalIds?.printKey?.trim() || "";
  if (!printKey) return null;
  if (parsePrintKey(printKey)?.game !== DBS_FW_GAME) return null;
  if (!ensureDbsFwIndex()) return null;
  const row = lookupDbsFwPrintDetail(printKey);
  if (!row) return null;
  const title = row.fullName?.trim();
  if (!title) return null;

  return {
    title,
    ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
    facts: dbsFwPrintFacts(row, PROVIDER_ID),
    externalIds: {
      [PROVIDER_ID]: printKey,
      printKey,
    },
  };
}

export const dbsfwModule = createDbsCatalogModule({
  providerId: PROVIDER_ID,
  providerLabel: PROVIDER_LABEL,
  catalogueLabel: "Dragon Ball Fusion World",
  factLabel: "DBS FW",
  printGame: DBS_FW_GAME,
  defaultLanguage: "en",
  websiteUrl: "https://www.dbs-cardgame.com/fw/en/cardlist/",
  notes:
    "Fusion World (fw/en cardlist, pas de locale FR) → `data/dbs/fw/`. Faces Bandai (SAMPLE). Dos sleeve placeholder Masters. Sync : Catalogue Extract (admin / worker).",
  syncHint: "Catalogue Sync (admin)",
  probePrintKey: PROBE_PRINT_KEY,
  probeCardName: PROBE_CARD_NAME,
  catalog: dbsfwCatalog,
  dbPath: dbsFwDbPath,
  ensureIndex: ensureDbsFwIndex,
  listPrintSets: listDbsFwPrintSets,
  searchPrints: searchDbsFwPrints,
  lookupPrint: lookupDbsFwPrint,
  lookupDetail: lookupDbsFwPrintDetail,
  resolveMetadata: resolveFromLocal,
  loadBoosterComposition: () => {
    const raw = dbsfwBoosterComposition as BoosterCompositionFile;
    return raw?.version === 1 ? raw : null;
  },
});

export { dbsFwDbPath, ensureDbsFwIndex, writeDbsFwIndex } from "./indexStore";
