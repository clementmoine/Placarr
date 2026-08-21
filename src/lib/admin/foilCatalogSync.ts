/**
 * Foil pack stale helpers + kick Catalogue auto-sync loop.
 * Corpus-wide auto refresh lives in `catalogueAutoSync.ts`.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { CatalogueExtractTarget } from "@/lib/admin/catalogueExtractRunner";
import { cataloguePackForExtractTarget } from "@/lib/admin/cataloguePacks";
import { packLogsDir } from "@/lib/packPaths";
import { dataRoot, foilPackDir } from "@/lib/runtimeData";

import { startCatalogueAutoSyncLoop } from "./catalogueAutoSync";

const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function maxAgeMs(): number {
  const raw = Number(
    process.env.PLACARR_CATALOG_SYNC_MAX_AGE_MS ??
      process.env.PLACARR_FOIL_SYNC_MAX_AGE_MS,
  );
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_AGE_MS;
}

function lastRunPath(pack: CatalogueExtractTarget): string {
  const dataPack = cataloguePackForExtractTarget(pack)?.id ?? pack;
  return path.join(packLogsDir(dataPack), "last-run.json");
}

function lastRunMtime(pack: CatalogueExtractTarget): number | null {
  const p = lastRunPath(pack);
  if (!existsSync(p)) return null;
  try {
    return statSync(p).mtimeMs;
  } catch {
    return null;
  }
}

function packLooksEmpty(pack: CatalogueExtractTarget): boolean {
  if (pack === "lorcana") {
    const cards = path.join(dataRoot(), "lorcana", "cards-index.json");
    const web = path.join(foilPackDir("lorcana"), "web");
    return !existsSync(cards) && !existsSync(web);
  }
  if (pack === "naruto") {
    const cards = path.join(
      dataRoot(),
      "naruto",
      "carddass",
      "cards-index.json",
    );
    const db = path.join(dataRoot(), "naruto", "carddass", "catalog.sqlite");
    return !existsSync(cards) && !existsSync(db);
  }
  if (pack === "dbs-cg") {
    const cards = path.join(dataRoot(), "dbs", "cg", "cards-index.json");
    const db = path.join(dataRoot(), "dbs", "cg", "catalog.sqlite");
    return !existsSync(cards) && !existsSync(db);
  }
  if (pack === "dbs-fw") {
    const cards = path.join(dataRoot(), "dbs", "fw", "cards-index.json");
    const db = path.join(dataRoot(), "dbs", "fw", "catalog.sqlite");
    return !existsSync(cards) && !existsSync(db);
  }
  const shaders = path.join(foilPackDir("pokemon"), "shaders");
  const db = path.join(dataRoot(), "pokemon", "catalog.sqlite");
  return !existsSync(shaders) && !existsSync(db);
}

export function isFoilPackStale(pack: CatalogueExtractTarget): boolean {
  if (packLooksEmpty(pack)) return true;
  const mtime = lastRunMtime(pack);
  if (mtime == null) return true;
  return Date.now() - mtime > maxAgeMs();
}

/** @deprecated Prefer catalogueAutoSync — maps pack → provider catalog.refresh */
export async function maybeEnqueueFoilCatalogSync(
  pack: CatalogueExtractTarget,
): Promise<boolean> {
  const { maybeEnqueueFoilCatalogSync: enqueue } =
    await import("./catalogueAutoSync");
  return enqueue(pack);
}

export function startFoilCatalogSyncLoop(): void {
  startCatalogueAutoSyncLoop();
}

export { startCatalogueAutoSyncLoop } from "./catalogueAutoSync";

/** @internal */
export function resetFoilCatalogSyncForTests(): void {
  void import("./catalogueAutoSync").then((m) =>
    m.resetCatalogueAutoSyncForTests(),
  );
}

/** Touch helper for tests / status — read last-run without throwing. */
export function readFoilLastRun(pack: CatalogueExtractTarget): unknown | null {
  const p = lastRunPath(pack);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
