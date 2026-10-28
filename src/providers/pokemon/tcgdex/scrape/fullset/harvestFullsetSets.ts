/**
 * Harvest Fullset.fr Pokémon set index → `data/pokemon/sources/fullset-sets.json`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import {
  pokemonSourcePath,
  pokemonSyncedSourcePath,
} from "@/providers/pokemon/syncedSources";

import {
  fullsetPokemonSetsIndexUrl,
  parseFullsetPokemonSetsHtml,
  type FullsetPokemonSetsLedger,
} from "./parseFullsetSets";

const LEDGER_FILE = "fullset-sets.json";
const UA =
  "Mozilla/5.0 (compatible; Placarr/0.1; +https://github.com/) FullsetSetsHarvest";

export function fullsetPokemonSetsLedgerPath(): string {
  return pokemonSourcePath(LEDGER_FILE);
}

export function fullsetPokemonSetsWritePath(): string {
  return pokemonSyncedSourcePath(LEDGER_FILE);
}

export async function harvestFullsetPokemonSets(opts?: {
  signal?: AbortSignal;
}): Promise<FullsetPokemonSetsLedger> {
  const url = fullsetPokemonSetsIndexUrl();
  const res = await httpGet<string>(url, {
    signal: opts?.signal,
    timeout: 40_000,
    responseType: "text",
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      Referer: "https://fullset.fr/",
    },
  });
  const html = typeof res.data === "string" ? res.data : "";
  const sets = parseFullsetPokemonSetsHtml(html);
  if (sets.length === 0) {
    throw new Error(`fullset sets harvest: no rows parsed from ${url}`);
  }
  const ledger: FullsetPokemonSetsLedger = {
    source: url,
    observed: new Date().toISOString(),
    sets,
  };
  const dest = fullsetPokemonSetsWritePath();
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return ledger;
}
