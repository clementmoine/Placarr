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

import { dbsCgDbPath, DBS_CG_PACK_ID } from "./indexStore";

export async function refreshDbsCgCatalog(
  opts?: ProviderCatalogRefreshOpts,
): Promise<void> {
  // Bandai's cardlist is live — auto refresh re-scrapes, clones the TCG Arena
  // EN dump, then fills FR faces over HTTP. `--offline` still ranges a clone
  // already on disk.
  const { runDbsCgPackPipeline } = await import(
    /* webpackIgnore: true */
    "./cli"
  );
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
