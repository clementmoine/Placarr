/**
 * Catalogue auto-sync — Plex-like: enqueue ProviderModule.catalog.refresh when
 * status().stale. Extends the former foil-only loop to all catalog corpora.
 */

import {
  discoverCatalogProviderModules,
  getCatalogProviderModule,
} from "@/core/catalog/catalog";
import {
  BACKGROUND_WORK_KIND,
  enqueueBackgroundWorkJob,
} from "@/core/collect/jobs/workQueue";
import { cataloguePackForExtractTarget } from "@/lib/admin/cataloguePacks";

const DEFAULT_CHECK_MS = 60 * 60 * 1000;

type GlobalSyncState = {
  loopStarted?: boolean;
  syncScheduled?: Record<string, boolean>;
};

const globalStateKey = "__placarrCatalogueAutoSync__";

function globalSyncState(): GlobalSyncState {
  const root = globalThis as typeof globalThis &
    Record<string, GlobalSyncState>;
  if (!root[globalStateKey]) root[globalStateKey] = { syncScheduled: {} };
  return root[globalStateKey]!;
}

function isEnabled(): boolean {
  const raw =
    process.env.PLACARR_CATALOGUE_AUTO_SYNC?.trim().toLowerCase() ??
    process.env.PLACARR_FOIL_AUTO_SYNC?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return true;
}

function checkIntervalMs(): number {
  const raw = Number(
    process.env.PLACARR_CATALOGUE_SYNC_CHECK_MS ??
      process.env.PLACARR_FOIL_SYNC_CHECK_MS,
  );
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CHECK_MS;
}

export async function maybeEnqueueCatalogueProviderSync(
  providerId: string,
): Promise<boolean> {
  if (!isEnabled()) return false;
  const mdl = getCatalogProviderModule(providerId);
  if (!mdl?.catalog) return false;
  const status = await mdl.catalog.status();
  if (!status.stale) return false;

  const state = globalSyncState();
  state.syncScheduled ??= {};
  if (state.syncScheduled[providerId]) return false;
  state.syncScheduled[providerId] = true;

  try {
    await enqueueBackgroundWorkJob({
      kind: BACKGROUND_WORK_KIND.catalogProviderSync,
      payload: { providerId, auto: true },
      replaceOpenForKind: false,
    });
    return true;
  } catch (error) {
    console.warn(`[catalogue sync] failed to enqueue ${providerId}:`, error);
    return false;
  } finally {
    state.syncScheduled[providerId] = false;
  }
}

export async function maybeEnqueueAllStaleCatalogueSyncs(): Promise<number> {
  if (!isEnabled()) return 0;
  let n = 0;
  for (const mdl of discoverCatalogProviderModules()) {
    if (await maybeEnqueueCatalogueProviderSync(mdl.info.id)) n += 1;
  }
  return n;
}

/** Start periodic stale checks (worker boot or admin kick). */
export function startCatalogueAutoSyncLoop(): void {
  if (!isEnabled()) return;
  const state = globalSyncState();
  if (state.loopStarted) return;
  state.loopStarted = true;

  void maybeEnqueueAllStaleCatalogueSyncs();
  setInterval(() => {
    void maybeEnqueueAllStaleCatalogueSyncs();
  }, checkIntervalMs()).unref?.();
}

/** @deprecated Prefer startCatalogueAutoSyncLoop */
export function startFoilCatalogSyncLoop(): void {
  startCatalogueAutoSyncLoop();
}

/** @deprecated Prefer maybeEnqueueCatalogueProviderSync by dataPack mapping */
export async function maybeEnqueueFoilCatalogSync(
  pack: string,
): Promise<boolean> {
  const byPack = discoverCatalogProviderModules().find(
    (mdl) =>
      mdl.catalog?.dataPack === pack ||
      mdl.catalog?.dataPack === cataloguePackForExtractTarget(pack)?.id,
  );
  if (!byPack) return false;
  return maybeEnqueueCatalogueProviderSync(byPack.info.id);
}

/** @internal */
export function resetCatalogueAutoSyncForTests(): void {
  const state = globalSyncState();
  state.loopStarted = false;
  state.syncScheduled = {};
}
