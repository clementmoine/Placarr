/**
 * Load local dbscards list dumps into a printKey price index.
 *
 * Masters: `data/dbs/cg/dbscards-{fr,en}.json` — prefer FR.
 * Fusion World: `data/dbs/fw/dbscards-en.json` (no FR list on the site).
 *
 * Local files only — no HTTP. Refresh still honours `evidenceOnly` by
 * returning empty when the dump is absent (other price providers may run).
 */
import { existsSync, readFileSync } from "node:fs";

import { parsePrintKey } from "@/core/identify/printKey";
import { DBS_CG_GAME } from "@/providers/dbscg/printIdentity";
import { DBS_FW_GAME } from "@/providers/dbsfw/printIdentity";
import { DBSCARDS_SITES } from "@/providers/shared/dbscards/list";
import {
  lookupDbscardsPrice,
  mergeDbscardsPriceIndexes,
  priceIndexFromDbscardsTiles,
  type DbscardsPriceCard,
  type DbscardsPriceIndex,
} from "@/providers/shared/dbscards/priceIndex";
import { dbscardsIndexPath } from "@/providers/shared/dbscards/scrapeList";
import type { DbscardsTile } from "@/providers/shared/dbscards/tile";

const DBS_CG_PACK = "dbs/cg";
const DBS_FW_PACK = "dbs/fw";

/** In-process cache — checklist refresh hits the same dump for every card. */
let memoryIndex: DbscardsPriceIndex | null = null;
let memoryLoadedAt = 0;

/** Dumps are static until the next scrape; a day is plenty. */
export const DBSCARDS_PRICE_TTL_MS = 24 * 60 * 60 * 1000;

export function resetDbscardsPriceIndexCache(): void {
  memoryIndex = null;
  memoryLoadedAt = 0;
}

function readTiles(packId: string, lang: string): DbscardsTile[] {
  const file = dbscardsIndexPath(packId, lang);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return Array.isArray(raw) ? (raw as DbscardsTile[]) : [];
  } catch {
    return [];
  }
}

export function loadDbscardsPriceIndexFromDisk(): DbscardsPriceIndex {
  const mastersFr = priceIndexFromDbscardsTiles(readTiles(DBS_CG_PACK, "fr"), {
    game: DBS_CG_GAME,
    origin: DBSCARDS_SITES.masters.origin,
    aliasSprAsPr: true,
  });
  const mastersEn = priceIndexFromDbscardsTiles(readTiles(DBS_CG_PACK, "en"), {
    game: DBS_CG_GAME,
    origin: DBSCARDS_SITES.masters.origin,
    aliasSprAsPr: true,
  });
  const fusionEn = priceIndexFromDbscardsTiles(readTiles(DBS_FW_PACK, "en"), {
    game: DBS_FW_GAME,
    origin: DBSCARDS_SITES.fusion.origin,
  });
  return mergeDbscardsPriceIndexes(mastersEn, mastersFr, fusionEn);
}

/**
 * Load (or reuse) the compact dbscards price index.
 * Never throws — empty index when dumps are missing.
 */
export async function loadDbscardsPriceIndex(options: {
  now?: Date;
  /**
   * Rejoue uniquement un index déjà chargé en mémoire — aucun I/O.
   * Miss ⇒ index vide (les autres providers de prix peuvent encore répondre).
   */
  evidenceOnly?: boolean;
} = {}): Promise<DbscardsPriceIndex> {
  const nowMs = (options.now ?? new Date()).getTime();
  if (memoryIndex && nowMs - memoryLoadedAt < DBSCARDS_PRICE_TTL_MS) {
    return memoryIndex;
  }
  if (options.evidenceOnly) {
    return memoryIndex ?? {};
  }
  try {
    memoryIndex = loadDbscardsPriceIndexFromDisk();
    memoryLoadedAt = nowMs;
    return memoryIndex;
  } catch {
    memoryIndex = {};
    memoryLoadedAt = nowMs;
    return memoryIndex;
  }
}

export async function fetchDbscardsCardForPrintKey(
  printKey: string,
  options: { evidenceOnly?: boolean; now?: Date } = {},
): Promise<DbscardsPriceCard | null> {
  const identity = parsePrintKey(printKey);
  if (
    !identity ||
    (identity.game !== DBS_CG_GAME && identity.game !== DBS_FW_GAME)
  ) {
    return null;
  }
  const index = await loadDbscardsPriceIndex(options);
  return lookupDbscardsPrice(index, printKey);
}
