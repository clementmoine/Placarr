import { createGameBarcodeEnrichmentDeps } from "@/services/provider/barcode";
import { PROVIDER_MODULES } from "@/services/provider/registry";
import type {
  BarcodeLookupType,
  GameBarcodeEnrichmentDeps,
} from "@/types/providerModule";

import { resolveSettledLookups } from "./payload";

const RECORD_SLIM_BARCODE_TYPES: BarcodeLookupType[] = [
  "games",
  "books",
  "musics",
  "movies",
  "boardgames",
  "generic",
];

let cachedSlimSkipKeys: Set<string> | null = null;

/**
 * Lookup task keys contributed by providers flagged `slowScanScrape`. Derived
 * from the registry (no provider-id literals) by probing each tagged module's
 * `buildBarcodeTasks` with no-op deps so we read keys without firing scrapes.
 */
function recordSlimSkipLookupKeys(): Set<string> {
  if (cachedSlimSkipKeys) return cachedSlimSkipKeys;
  const keys = new Set<string>();
  const noopDeps = new Proxy(
    {},
    { get: () => () => Promise.resolve(null) },
  ) as never;
  for (const module of PROVIDER_MODULES) {
    if (!module.info.slowScanScrape || !module.buildBarcodeTasks) continue;
    for (const type of RECORD_SLIM_BARCODE_TYPES) {
      const tasks = module.buildBarcodeTasks(noopDeps, type, {
        barcode: "0000000000000",
      });
      for (const key of Object.keys(tasks)) keys.add(key);
    }
  }
  cachedSlimSkipKeys = keys;
  return keys;
}

export function isBarcodeRecordSlimMode(): boolean {
  return process.env.BARCODE_RECORD_SLIM === "1";
}

export function filterBarcodeLookupTasksForRecord(
  tasks: Record<string, Promise<unknown>>,
): Record<string, Promise<unknown>> {
  if (!isBarcodeRecordSlimMode()) return tasks;
  const skip = recordSlimSkipLookupKeys();
  return Object.fromEntries(
    Object.entries(tasks).filter(([key]) => !skip.has(key)),
  );
}

/** Slim RECORD: skip slow post-scan enrich (PC fallback + ScreenScraper media). */
export function buildBarcodeRecordEnrichmentDeps():
  | GameBarcodeEnrichmentDeps
  | undefined {
  if (!isBarcodeRecordSlimMode()) return undefined;
  return {
    ...createGameBarcodeEnrichmentDeps(),
    fetchReferencePriceByBarcode: undefined,
    fetchGameMediaByBarcode: undefined,
  };
}

export async function resolveBarcodeLookupTasks(
  tasks: Record<string, Promise<unknown>>,
): Promise<Record<string, unknown>> {
  const filtered = filterBarcodeLookupTasksForRecord(tasks);
  if (!process.env.RECORD) {
    return resolveSettledLookups(filtered);
  }

  const entries = Object.entries(filtered);
  const batchStarted = Date.now();
  const settled = await Promise.allSettled(
    entries.map(async ([key, task]) => {
      const started = Date.now();
      try {
        const value = await task;
        // eslint-disable-next-line no-console
        console.log(`[record lookup] ${key} ${Date.now() - started}ms ok`);
        return value;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log(
          `[record lookup] ${key} ${Date.now() - started}ms error`,
          error instanceof Error ? error.message : error,
        );
        throw error;
      }
    }),
  );
  // eslint-disable-next-line no-console
  console.log(
    `[record lookup] batch ${Date.now() - batchStarted}ms (${entries.map(([key]) => key).join(", ")})`,
  );

  return entries.reduce<Record<string, unknown>>((acc, [key], index) => {
    const result = settled[index];
    acc[key] = result?.status === "fulfilled" ? result.value : null;
    return acc;
  }, {});
}
