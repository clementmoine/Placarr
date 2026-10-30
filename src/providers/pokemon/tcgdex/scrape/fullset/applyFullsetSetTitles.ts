/**
 * Overlay Fullset.fr FR set titles onto TCGdex `sets` + `print_titles`.
 * Match via EN set name (folded) or logo abbr (`BLK` ↔ officialAbbr).
 */
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  ensureTcgdexIndex,
  resetTcgdexIndexCache,
  tcgdexDbPath,
} from "../../indexStore";
import { loadTcgdexSetLogoIndex } from "../../setLogos";
import { fullsetPokemonSetsLedgerPath } from "./harvestFullsetSets";
import {
  foldFullsetSetName,
  normalizeFullsetSetRef,
  type FullsetPokemonSetRow,
  type FullsetPokemonSetsLedger,
} from "./parseFullsetSets";

export type FullsetSetTitleMatch = {
  fullsetId: string;
  setId: string;
  nameFr: string;
  via: "en-name" | "abbr";
  previousFr: string | null;
};

export type ApplyFullsetSetTitlesResult = {
  ledgerSets: number;
  matched: number;
  updated: number;
  unchanged: number;
  unmatched: number;
  matches: FullsetSetTitleMatch[];
};

function readLedger(filePath: string): FullsetPokemonSetsLedger | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as FullsetPokemonSetsLedger;
    if (!raw || !Array.isArray(raw.sets)) return null;
    return raw;
  } catch {
    return null;
  }
}

function buildEnNameIndex(db: DatabaseSync): Map<string, string> {
  const rows = db
    .prepare(
      `SELECT LOWER(set_id) AS setId, name
         FROM sets
        WHERE lang = 'en'
          AND name IS NOT NULL
          AND TRIM(name) != ''`,
    )
    .all() as { setId: string; name: string }[];
  const map = new Map<string, string>();
  for (const row of rows) {
    const key = foldFullsetSetName(row.name);
    if (!key || map.has(key)) continue;
    map.set(key, row.setId);
  }
  return map;
}

function buildAbbrIndex(): Map<string, string> {
  const map = new Map<string, string>();
  const index = loadTcgdexSetLogoIndex();
  if (!index) return map;
  for (const row of index.sets) {
    const setId = row.id?.trim().toLowerCase();
    if (!setId) continue;
    for (const raw of [row.officialAbbr, row.localizedAbbr, row.tcgOnline]) {
      const ref = normalizeFullsetSetRef(raw);
      if (!ref || map.has(ref)) continue;
      map.set(ref, setId);
    }
  }
  return map;
}

function resolveSetId(
  row: FullsetPokemonSetRow,
  byEnName: Map<string, string>,
  byAbbr: Map<string, string>,
): { setId: string; via: "en-name" | "abbr" } | null {
  const enKey = foldFullsetSetName(row.nameEn || row.nameFr);
  const byName = enKey ? byEnName.get(enKey) : undefined;
  if (byName) return { setId: byName, via: "en-name" };
  const ref = normalizeFullsetSetRef(row.ref);
  if (ref) {
    const byRef = byAbbr.get(ref);
    if (byRef) return { setId: byRef, via: "abbr" };
  }
  return null;
}

/**
 * Apply Fullset FR titles from the synced ledger onto the local TCGdex DB.
 * No-op when ledger or DB is missing.
 */
export function applyFullsetPokemonSetTitles(opts?: {
  ledgerPath?: string;
  dbPath?: string;
}): ApplyFullsetSetTitlesResult {
  const empty: ApplyFullsetSetTitlesResult = {
    ledgerSets: 0,
    matched: 0,
    updated: 0,
    unchanged: 0,
    unmatched: 0,
    matches: [],
  };

  const ledger = readLedger(opts?.ledgerPath ?? fullsetPokemonSetsLedgerPath());
  if (!ledger) return empty;

  const dbPath = opts?.dbPath ?? tcgdexDbPath();
  if (!existsSync(dbPath)) return { ...empty, ledgerSets: ledger.sets.length };

  // Ensure schema / connection side-effects for the default path.
  if (!opts?.dbPath) ensureTcgdexIndex();

  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA busy_timeout = 30000");
    const byEnName = buildEnNameIndex(db);
    const byAbbr = buildAbbrIndex();

    const readFr = db.prepare(
      `SELECT name FROM sets WHERE lang = 'fr' AND LOWER(set_id) = LOWER(?) LIMIT 1`,
    );
    const updateSet = db.prepare(
      `UPDATE sets SET name = ? WHERE lang = 'fr' AND LOWER(set_id) = LOWER(?)`,
    );
    const updateTitles = db.prepare(
      `UPDATE print_titles
          SET set_name = ?
        WHERE lang = 'fr'
          AND print_key IN (
            SELECT print_key FROM prints WHERE LOWER(set_id) = LOWER(?)
          )`,
    );

    const matches: FullsetSetTitleMatch[] = [];
    let updated = 0;
    let unchanged = 0;
    let unmatched = 0;

    db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of ledger.sets) {
        const hit = resolveSetId(row, byEnName, byAbbr);
        if (!hit) {
          unmatched += 1;
          continue;
        }
        const prevRow = readFr.get(hit.setId) as { name: string | null } | undefined;
        const previousFr = prevRow?.name?.trim() || null;
        const nextFr = row.nameFr.trim();
        matches.push({
          fullsetId: row.fullsetId,
          setId: hit.setId,
          nameFr: nextFr,
          via: hit.via,
          previousFr,
        });
        if (previousFr === nextFr) {
          unchanged += 1;
          continue;
        }
        updateSet.run(nextFr, hit.setId);
        updateTitles.run(nextFr, hit.setId);
        updated += 1;
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    resetTcgdexIndexCache();
    return {
      ledgerSets: ledger.sets.length,
      matched: matches.length,
      updated,
      unchanged,
      unmatched,
      matches,
    };
  } finally {
    db.close();
  }
}
