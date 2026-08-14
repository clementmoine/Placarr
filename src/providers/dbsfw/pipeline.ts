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

import { runDbsFwPackPipeline } from "./cli";
import { dbsFwDbPath, DBS_FW_PACK_ID } from "./indexStore";

export async function refreshDbsFwCatalog(
  opts?: ProviderCatalogRefreshOpts,
): Promise<void> {
  await runDbsFwPackPipeline([]);
  const logs = packLogsDir(DBS_FW_PACK_ID);
  mkdirSync(logs, { recursive: true });
  writeFileSync(
    path.join(logs, "last-run.json"),
    `${JSON.stringify({ finishedAt: new Date().toISOString(), auto: Boolean(opts?.auto) })}\n`,
  );
}

export function dbsFwCatalogStatus() {
  const db = dbsFwDbPath();
  const cardsIndex = dataPackPath(DBS_FW_PACK_ID, "cards-index.json");
  const empty = !existsSync(db) && !existsSync(cardsIndex);
  return statusFromLastRun({ dataPack: DBS_FW_PACK_ID, empty });
}

export const dbsfwCatalog: ProviderCatalogHooks = {
  dataPack: DBS_FW_PACK_ID,
  status: dbsFwCatalogStatus,
  refresh: refreshDbsFwCatalog,
};
