/**
 * Foil catalogue sync — enqueue foilExtract when pack data is stale (like iCollect).
 * Manual admin/CLI still available; this is the automatic path.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  BACKGROUND_WORK_KIND,
  enqueueBackgroundWorkJob,
} from "@/core/collect/jobs/workQueue";
import type { FoilExtractTarget } from "@/lib/admin/foilExtractRunner";
import { packLogsDir } from "@/lib/packPaths";
import { dataRoot, foilPackDir } from "@/lib/runtimeData";

const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_CHECK_MS = 60 * 60 * 1000;

type GlobalSyncState = {
  loopStarted?: boolean;
  syncScheduled?: Record<string, boolean>;
};

const globalStateKey = "__placarrFoilCatalogSync__";

function globalSyncState(): GlobalSyncState {
  const root = globalThis as typeof globalThis &
    Record<string, GlobalSyncState>;
  if (!root[globalStateKey]) root[globalStateKey] = { syncScheduled: {} };
  return root[globalStateKey]!;
}

function isEnabled(): boolean {
  const raw = process.env.PLACARR_FOIL_AUTO_SYNC?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return true;
}

function maxAgeMs(): number {
  const raw = Number(process.env.PLACARR_FOIL_SYNC_MAX_AGE_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_AGE_MS;
}

function lastRunMtime(pack: FoilExtractTarget): number | null {
  const p = path.join(packLogsDir(pack), "last-run.json");
  if (!existsSync(p)) return null;
  try {
    return statSync(p).mtimeMs;
  } catch {
    return null;
  }
}

function packLooksEmpty(pack: FoilExtractTarget): boolean {
  if (pack === "lorcana") {
    const cards = path.join(dataRoot(), "lorcana", "cards-index.json");
    const web = path.join(foilPackDir("lorcana"), "web");
    return !existsSync(cards) && !existsSync(web);
  }
  const shaders = path.join(foilPackDir("pokemon"), "shaders");
  const db = path.join(dataRoot(), "pokemon", "catalog.sqlite");
  return !existsSync(shaders) && !existsSync(db);
}

export function isFoilPackStale(pack: FoilExtractTarget): boolean {
  if (packLooksEmpty(pack)) return true;
  const mtime = lastRunMtime(pack);
  if (mtime == null) return true;
  return Date.now() - mtime > maxAgeMs();
}

export async function maybeEnqueueFoilCatalogSync(
  pack: FoilExtractTarget,
): Promise<boolean> {
  if (!isEnabled()) return false;
  if (!isFoilPackStale(pack)) return false;

  const state = globalSyncState();
  state.syncScheduled ??= {};
  if (state.syncScheduled[pack]) return false;
  state.syncScheduled[pack] = true;

  try {
    await enqueueBackgroundWorkJob({
      kind: BACKGROUND_WORK_KIND.foilExtract,
      payload: { target: pack, auto: true },
      replaceOpenForKind: false,
    });
    return true;
  } catch (error) {
    console.warn(`[foil sync] failed to enqueue ${pack}:`, error);
    return false;
  } finally {
    state.syncScheduled[pack] = false;
  }
}

export function startFoilCatalogSyncLoop(): void {
  if (!isEnabled()) return;
  const state = globalSyncState();
  if (state.loopStarted) return;
  state.loopStarted = true;

  const checkMs = (() => {
    const raw = Number(process.env.PLACARR_FOIL_SYNC_CHECK_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CHECK_MS;
  })();

  void maybeEnqueueFoilCatalogSync("lorcana");
  void maybeEnqueueFoilCatalogSync("pokemon");

  setInterval(() => {
    void maybeEnqueueFoilCatalogSync("lorcana");
    void maybeEnqueueFoilCatalogSync("pokemon");
  }, checkMs).unref?.();
}

/** @internal */
export function resetFoilCatalogSyncForTests(): void {
  const root = globalThis as typeof globalThis &
    Record<string, GlobalSyncState>;
  delete root[globalStateKey];
}

/** Touch helper for tests / status — read last-run without throwing. */
export function readFoilLastRun(pack: FoilExtractTarget): unknown | null {
  const p = path.join(packLogsDir(pack), "last-run.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
