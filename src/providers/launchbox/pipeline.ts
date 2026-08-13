import { existsSync, statSync } from "node:fs";

import type {
  ProviderCatalogHooks,
  ProviderCatalogRefreshOpts,
  ProviderCatalogStatus,
} from "@/types/providerModule";

import {
  buildLaunchBoxIndex,
  getLaunchBoxIndexPath,
} from "./indexStore";

export async function refreshLaunchBoxCatalog(
  _opts?: ProviderCatalogRefreshOpts,
): Promise<void> {
  const db = await buildLaunchBoxIndex({ allowDownload: true });
  if (!db) throw new Error("LaunchBox index build failed");
}

export function launchBoxCatalogStatus(): ProviderCatalogStatus {
  const file = getLaunchBoxIndexPath();
  if (!existsSync(file)) {
    return { empty: true, stale: true, lastSyncAt: null };
  }
  try {
    const mtime = statSync(file).mtimeMs;
    return {
      empty: false,
      stale: false,
      lastSyncAt: new Date(mtime).toISOString(),
    };
  } catch {
    return { empty: true, stale: true, lastSyncAt: null };
  }
}

export const launchboxCatalog: ProviderCatalogHooks = {
  dataPack: "launchbox",
  status: launchBoxCatalogStatus,
  refresh: refreshLaunchBoxCatalog,
};
