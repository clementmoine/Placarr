/**
 * Shared helpers for ProviderModule.catalog — last-run / empty pack signals.
 * Providers own their refresh; this only standardizes status shape.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { ProviderCatalogStatus } from "@/types/providerModule";
import { packLogsDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";

const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function catalogMaxAgeMs(): number {
  const raw = Number(process.env.PLACARR_CATALOG_SYNC_MAX_AGE_MS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  const foil = Number(process.env.PLACARR_FOIL_SYNC_MAX_AGE_MS);
  return Number.isFinite(foil) && foil > 0 ? foil : DEFAULT_MAX_AGE_MS;
}

export function lastRunAtForPack(dataPack: string): string | null {
  const p = path.join(packLogsDir(dataPack), "last-run.json");
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as { finishedAt?: string; at?: string };
    if (typeof parsed.finishedAt === "string") return parsed.finishedAt;
    if (typeof parsed.at === "string") return parsed.at;
    return new Date(statSync(p).mtimeMs).toISOString();
  } catch {
    try {
      return new Date(statSync(p).mtimeMs).toISOString();
    } catch {
      return null;
    }
  }
}

export function lastRunMtimeMs(dataPack: string): number | null {
  const iso = lastRunAtForPack(dataPack);
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export function statusFromLastRun(opts: {
  dataPack: string;
  empty: boolean;
  maxAgeMs?: number;
}): ProviderCatalogStatus {
  if (opts.empty) {
    return { empty: true, stale: true, lastSyncAt: null };
  }
  const lastSyncAt = lastRunAtForPack(opts.dataPack);
  const mtime = lastRunMtimeMs(opts.dataPack);
  if (mtime == null) {
    return { empty: false, stale: true, lastSyncAt: null };
  }
  const maxAge = opts.maxAgeMs ?? catalogMaxAgeMs();
  return {
    empty: false,
    stale: Date.now() - mtime > maxAge,
    lastSyncAt,
  };
}

export function dataPackPath(dataPack: string, ...parts: string[]): string {
  return path.join(dataRoot(), dataPack, ...parts);
}

export function pathExists(...parts: string[]): boolean {
  return existsSync(path.join(...parts));
}
