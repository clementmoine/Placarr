import { existsSync, statSync } from "node:fs";

import type {
  ProviderCatalogHooks,
  ProviderCatalogRefreshOpts,
  ProviderCatalogStatus,
} from "@/types/providerModule";
import { catalogMaxAgeMs } from "@/providers/shared/catalogCorpus";

import { buildNoIntroIndex, getNoIntroIndexPath } from "./indexStore";
import { isNoIntroDatSourceConfigured } from "./syncDatPack";

export async function refreshNoIntroCatalog(
  opts?: ProviderCatalogRefreshOpts,
): Promise<void> {
  // No DAT / pack configured → nothing to build. Soft-skip even for manual
  // admin Sync so the job does not fail→retry (attempts spam) forever.
  if (!isNoIntroDatSourceConfigured({ allowDownload: true })) {
    console.warn(
      "[No-Intro] sync skipped — set NOINTRO_DAT_PATH or NOINTRO_DAT_PACK / URL, then admin Local indexes",
    );
    return;
  }
  const db = await buildNoIntroIndex({ allowDownload: true });
  if (db) return;
  // Source configured but build still empty (bad path / empty zip / parse).
  // Auto: keep soft (Plex-like). Manual: fail so admin sees the misconfig.
  if (opts?.auto) {
    console.warn(
      "[No-Intro] auto sync skipped — DAT source configured but index build returned empty",
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
      // Age wake-up for auto-sync; refresh no-ops when pack validators match.
      stale: Date.now() - mtime > catalogMaxAgeMs(),
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
  legacyWorkKind: "nointroIndexSync",
  status: noIntroCatalogStatus,
  refresh: refreshNoIntroCatalog,
};
