import { existsSync, statSync } from "node:fs";

import type {
  ProviderCatalogHooks,
  ProviderCatalogRefreshOpts,
  ProviderCatalogStatus,
} from "@/types/providerModule";
import { catalogMaxAgeMs } from "@/providers/shared/catalogCorpus";

import {
  runICollectCatalogSyncTick,
  runICollectFullSitemapSync,
} from "./catalogSync";
import { ensureICollectIndex, icollectIndexPath } from "./indexStore";

export async function refreshICollectCatalog(
  opts?: ProviderCatalogRefreshOpts,
): Promise<void> {
  if (opts?.auto) {
    await runICollectCatalogSyncTick();
    return;
  }
  const db = await ensureICollectIndex();
  if (!db) throw new Error("iCollect index unavailable");
  await runICollectFullSitemapSync(db);
}

export async function iCollectCatalogStatus(): Promise<ProviderCatalogStatus> {
  const file = icollectIndexPath();
  if (!existsSync(file)) {
    return { empty: true, stale: true, lastSyncAt: null };
  }
  const db = await ensureICollectIndex();
  if (!db) {
    return { empty: true, stale: true, lastSyncAt: null };
  }
  try {
    const mtime = statSync(file).mtimeMs;
    const lastSyncAt = new Date(mtime).toISOString();
    const stale = Date.now() - mtime > catalogMaxAgeMs();
    return { empty: false, stale, lastSyncAt };
  } catch {
    return { empty: true, stale: true, lastSyncAt: null };
  }
}

export const icollectCatalog: ProviderCatalogHooks = {
  dataPack: "icollect",
  status: iCollectCatalogStatus,
  refresh: refreshICollectCatalog,
};
