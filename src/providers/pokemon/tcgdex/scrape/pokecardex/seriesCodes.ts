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

export function loadPokecardexSeriesAliases(
  filePath = aliasLedgerPath(),
): Readonly<Record<string, string>> {
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as SeriesAliasLedger;
    return raw.aliases ?? {};
  } catch {
    return {};
  }
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
