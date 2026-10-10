/**
 * Curated TCGdex set id → PokéCardex `nom_court` (scan / symbole).
 *
 * Logo-index abbr lookup stays in `fillSets` / callers — this module stays
 * free of `setLogos` so symbol candidates can import aliases safely.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

type SeriesAliasLedger = {
  aliases?: Readonly<Record<string, string>>;
  /** Catalogue set ids with no intl scan folder on PokéCardex. */
  noScans?: Readonly<Record<string, string>>;
};

function aliasLedgerPath(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "pokemon",
    "tcgdex",
    "curated",
    "sources",
    "pokecardex-series.json",
  );
}

function readSeriesLedger(
  filePath = aliasLedgerPath(),
): SeriesAliasLedger {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as SeriesAliasLedger;
  } catch {
    return {};
  }
}

export function loadPokecardexSeriesAliases(
  filePath = aliasLedgerPath(),
): Readonly<Record<string, string>> {
  return readSeriesLedger(filePath).aliases ?? {};
}

/** Sets known absent from the intl scan CDN (skip retail fill). */
export function loadPokecardexNoScanSetIds(
  filePath = aliasLedgerPath(),
): ReadonlySet<string> {
  const noScans = readSeriesLedger(filePath).noScans ?? {};
  return new Set(
    Object.keys(noScans).map((id) => id.trim().toLowerCase()).filter(Boolean),
  );
}

/** PokéCardex accepts `POP1`, `DP`, and hyphenated kits (`TK1-LA`). */
export function isPokecardexSeriesCode(code: string): boolean {
  return /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(code.trim());
}

/** Curated alias only (`tk-ex-latia` → `TK1-LA`). */
export function pokecardexAliasCodeForSet(
  setId: string,
  aliases: Readonly<Record<string, string>> = loadPokecardexSeriesAliases(),
): string | null {
  const id = setId.trim().toLowerCase();
  if (!id) return null;
  const alias = aliases[id]?.trim();
  if (alias && isPokecardexSeriesCode(alias)) return alias.toUpperCase();
  return null;
}
