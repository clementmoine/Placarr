/**
 * Dragon Ball Heroes collector ids — H1-01, GM10-SEC, MM1-001, GDPB-01…
 */
import { buildPrintKey } from "@/core/identify/printKey";

import { DBH_PRINT_GAME } from "./pack";

export type DbhParsed = {
  set: string;
  number: string;
  printed: string;
};

/**
 * `H1-01` → set `h1`, number `01`
 * `GDM10-SEC` → set `gdm10`, number `sec`
 * `MM1-ASEC` → set `mm1`, number `asec`
 */
export function parseDbhPrinted(raw: string): DbhParsed | null {
  const trimmed = raw.trim().replace(/\s+/g, "").toUpperCase();
  const m = trimmed.match(
    /^([A-Z]{1,6}\d{0,2}|SH\d+|UGM\d+|UVM\d+|UM\d+|BM\d+|MM\d+|PBS|GDP[A-Z]*|PJS|SJP|UP|HUM|GD[A-Z0-9]*)-([A-Z0-9]+)$/i,
  );
  if (!m) return null;
  const set = m[1]!.toLowerCase();
  const number = m[2]!.toLowerCase();
  return {
    set,
    number,
    printed: `${m[1]!.toUpperCase()}-${m[2]!.toUpperCase()}`,
  };
}

export function dbhPrintKey(set: string, number: string): string | null {
  return buildPrintKey({
    game: DBH_PRINT_GAME,
    set,
    number,
  });
}

export function formatDbhReference(set: string, number: string): string {
  return `${set.trim().toUpperCase()}-${number.trim().toUpperCase()}`;
}

export function normalizeDbhSearchQuery(query: string): string {
  const parsed = parseDbhPrinted(query);
  if (parsed) return parsed.number;
  return query.trim().toLowerCase();
}
