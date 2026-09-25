/**
 * Load a *cards.fr list dump into a printKey price index (local files only).
 */
import { existsSync, readFileSync } from "node:fs";

import { parsePrintKey } from "@/core/identify/printKey";
import {
  lookupDbscardsPrice,
  priceIndexFromDbscardsTiles,
  priceIndexFromMappedTiles,
  type DbscardsPriceCard,
  type DbscardsPriceIndex,
} from "@/providers/shared/tcgcards/priceIndex";
import type { DbscardsTile } from "@/providers/shared/tcgcards/tile";

/** In-process cache — checklist refresh hits the same dump for every card. */
const memoryById = new Map<
  string,
  { index: DbscardsPriceIndex; loadedAt: number }
>();

/** Dumps are static until the next scrape; a day is plenty. */
export const CARDS_FR_PRICE_TTL_MS = 24 * 60 * 60 * 1000;

export function resetCardsFrPriceIndexCache(cacheId?: string): void {
  if (cacheId) memoryById.delete(cacheId);
  else memoryById.clear();
}

function readTiles(file: string): DbscardsTile[] {
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return Array.isArray(raw) ? (raw as DbscardsTile[]) : [];
  } catch {
    return [];
  }
}

export type CardsFrMappedPriceSpec = {
  cacheId: string;
  game: string;
  origin: string;
  indexPath: string;
  printKeyOf: (tile: DbscardsTile) => string | null;
};

export type CardsFrBandaiPriceSpec = {
  cacheId: string;
  game: string;
  origin: string;
  indexPath: string;
};

function loadMappedFromDisk(spec: CardsFrMappedPriceSpec): DbscardsPriceIndex {
  return priceIndexFromMappedTiles(readTiles(spec.indexPath), {
    origin: spec.origin,
    printKeyOf: spec.printKeyOf,
    preferHigherPrice: true,
  });
}

function loadBandaiFromDisk(spec: CardsFrBandaiPriceSpec): DbscardsPriceIndex {
  return priceIndexFromDbscardsTiles(readTiles(spec.indexPath), {
    game: spec.game,
    origin: spec.origin,
  });
}

async function loadIndex(
  cacheId: string,
  build: () => DbscardsPriceIndex,
  options: { now?: Date; evidenceOnly?: boolean } = {},
): Promise<DbscardsPriceIndex> {
  const nowMs = (options.now ?? new Date()).getTime();
  const hit = memoryById.get(cacheId);
  if (hit && nowMs - hit.loadedAt < CARDS_FR_PRICE_TTL_MS) {
    return hit.index;
  }
  if (options.evidenceOnly) {
    return hit?.index ?? {};
  }
  try {
    const index = build();
    memoryById.set(cacheId, { index, loadedAt: nowMs });
    return index;
  } catch {
    memoryById.set(cacheId, { index: {}, loadedAt: nowMs });
    return {};
  }
}

export async function fetchMappedCardsFrCardForPrintKey(
  printKey: string,
  spec: CardsFrMappedPriceSpec,
  options: { evidenceOnly?: boolean; now?: Date } = {},
): Promise<DbscardsPriceCard | null> {
  const identity = parsePrintKey(printKey);
  if (!identity || identity.game !== spec.game) return null;
  const index = await loadIndex(
    spec.cacheId,
    () => loadMappedFromDisk(spec),
    options,
  );
  return lookupDbscardsPrice(index, printKey);
}

export async function fetchBandaiCardsFrCardForPrintKey(
  printKey: string,
  spec: CardsFrBandaiPriceSpec,
  options: { evidenceOnly?: boolean; now?: Date } = {},
): Promise<DbscardsPriceCard | null> {
  const identity = parsePrintKey(printKey);
  if (!identity || identity.game !== spec.game) return null;
  const index = await loadIndex(
    spec.cacheId,
    () => loadBandaiFromDisk(spec),
    options,
  );
  return lookupDbscardsPrice(index, printKey);
}
