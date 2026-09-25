import { existsSync, statSync } from "node:fs";

import type {
  ProviderCatalogHooks,
  ProviderCatalogRefreshOpts,
  ProviderCatalogStatus,
} from "@/types/providerModule";

import { buildNoIntroIndex, getNoIntroIndexPath } from "./indexStore";
import { isNoIntroDatSourceConfigured } from "./syncDatPack";

export async function refreshNoIntroCatalog(
  opts?: ProviderCatalogRefreshOpts,
): Promise<void> {
  const db = await buildNoIntroIndex({ allowDownload: true });
  if (db) return;
  // Auto / Plex-like: missing DAT is a skip, not a failing job (no spam retries).
  if (opts?.auto) {
    console.warn(
      "[No-Intro] auto sync skipped — set NOINTRO_DAT_PATH or NOINTRO_DAT_PACK / URL",
    );
    return;
  }
  throw new Error("No-Intro index build failed");
}

export function noIntroCatalogStatus(): ProviderCatalogStatus {
  const file = getNoIntroIndexPath();
  if (!existsSync(file)) {
    // Empty + no source → not stale: auto-sync must not enqueue forever.
    const canSync = isNoIntroDatSourceConfigured();
    return { empty: true, stale: canSync, lastSyncAt: null };
  }
  try {
    const mtime = statSync(file).mtimeMs;
    return {
      empty: false,
      stale: false,
      lastSyncAt: new Date(mtime).toISOString(),
    };
  } catch {
    return {
      empty: true,
      stale: isNoIntroDatSourceConfigured(),
      lastSyncAt: null,
    };
  }
}

export const nointroCatalog: ProviderCatalogHooks = {
  dataPack: "nointro",
  status: noIntroCatalogStatus,
  refresh: refreshNoIntroCatalog,
};
