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
import {
  catalogueApkPacks,
  cataloguePackForExtractTarget,
} from "@/lib/admin/cataloguePacks";

const DEFAULT_CHECK_MS = 60 * 60 * 1000;
/** APK store updates are rare — one probe a day per pack is plenty. */
const DEFAULT_APK_STORE_CHECK_MS = 24 * 60 * 60 * 1000;

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
  n += await maybeEnqueueApkStoreFetches();
  return n;
}

function apkStoreAutoEnabled(): boolean {
  const raw = process.env.PLACARR_APK_STORE_AUTO?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return isEnabled();
}

function apkStoreCheckIntervalMs(): number {
  const raw = Number(process.env.PLACARR_APK_STORE_CHECK_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_APK_STORE_CHECK_MS;
}

/**
 * Store APK freshness — enqueue the pack extract, which probes the store
 * first. A newer APK runs the full extract; otherwise the job still refreshes
 * the network catalogue (CDN / LorcanaJSON) and skips Unity.
 */
export async function maybeEnqueueApkStoreFetches(): Promise<number> {
  if (!apkStoreAutoEnabled()) return 0;
  const { readApkStoreMeta } = await import("@/lib/admin/apkStoreFetch");
  let n = 0;
  for (const pack of catalogueApkPacks()) {
    const meta = await readApkStoreMeta(pack.id);
    const checkedAt = Date.parse(meta?.checkedAt ?? "");
    if (
      Number.isFinite(checkedAt) &&
      Date.now() - checkedAt < apkStoreCheckIntervalMs()
    ) {
      continue;
    }
    try {
      await enqueueBackgroundWorkJob({
        kind: BACKGROUND_WORK_KIND.catalogueExtract,
        payload: { target: pack.extractTarget, auto: true },
        replaceOpenForKind: true,
        replaceOpenPayloadMatch: {
          path: ["target"],
          equals: pack.extractTarget,
        },
      });
      n += 1;
    } catch (error) {
      console.warn(`[apk store] failed to enqueue ${pack.id}:`, error);
    }
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
