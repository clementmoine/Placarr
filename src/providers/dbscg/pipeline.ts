import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  ProviderCatalogHooks,
  ProviderCatalogRefreshOpts,
} from "@/types/providerModule";
import {
  dataPackPath,
  statusFromLastRun,
} from "@/providers/shared/catalogCorpus";
import { packLogsDir } from "@/lib/packPaths";

import { runDbsCgPackPipeline } from "./cli";
import { dbsCgDbPath, DBS_CG_PACK_ID } from "./indexStore";

export async function refreshDbsCgCatalog(
  opts?: ProviderCatalogRefreshOpts,
): Promise<void> {
  // Bandai's cardlist is live — auto refresh re-scrapes then pulls Deckplanet
  // faces (skip-existing). `--offline` is CLI-only (curated without network).
  await runDbsCgPackPipeline([]);
  const logs = packLogsDir(DBS_CG_PACK_ID);
  mkdirSync(logs, { recursive: true });
  writeFileSync(
    path.join(logs, "last-run.json"),
    `${JSON.stringify({ finishedAt: new Date().toISOString(), auto: Boolean(opts?.auto) })}\n`,
  );
}

export function dbsCgCatalogStatus() {
  const db = dbsCgDbPath();
  const cardsIndex = dataPackPath(DBS_CG_PACK_ID, "cards-index.json");
  const empty = !existsSync(db) && !existsSync(cardsIndex);
  return statusFromLastRun({ dataPack: DBS_CG_PACK_ID, empty });
}

export const dbscgCatalog: ProviderCatalogHooks = {
  dataPack: DBS_CG_PACK_ID,
  status: dbsCgCatalogStatus,
  refresh: refreshDbsCgCatalog,
};
