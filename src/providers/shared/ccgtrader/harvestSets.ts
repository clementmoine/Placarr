/**
 * Harvest CCG Trader game set index → `data/<pack>/sources/ccgtrader-sets.json`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  packSyncedSourcePath,
  resolvePackSyncedSourcePath,
} from "@/lib/packPaths";

import {
  fetchCcgtraderGame,
  type CcgtraderGame,
  type CcgtraderSetRow,
} from "./fetchGame";
import { ccgtraderGamePageUrl } from "./site";

export const CCGTRADER_SETS_LEDGER_FILE = "ccgtrader-sets.json";

export type CcgtraderSetsLedger = {
  source: string;
  observed: string;
  urlTitle: string;
  gameId: number;
  name: string;
  publisher: string | null;
  inPrint: boolean | null;
  languages: string[];
  seriesCount: number;
  setCount: number;
  series: CcgtraderGame["series"];
  sets: CcgtraderSetRow[];
};

export function ccgtraderSetsLedgerReadPath(packId: string): string {
  return resolvePackSyncedSourcePath(packId, CCGTRADER_SETS_LEDGER_FILE);
}

export function ccgtraderSetsLedgerWritePath(packId: string): string {
  return packSyncedSourcePath(packId, CCGTRADER_SETS_LEDGER_FILE);
}

export async function harvestCcgtraderSets(opts: {
  packId: string;
  urlTitle: string;
  signal?: AbortSignal;
}): Promise<CcgtraderSetsLedger> {
  const game = await fetchCcgtraderGame({
    urlTitle: opts.urlTitle,
    signal: opts.signal,
  });
  const ledger: CcgtraderSetsLedger = {
    source: ccgtraderGamePageUrl(opts.urlTitle),
    observed: new Date().toISOString(),
    urlTitle: game.urlTitle,
    gameId: game.id,
    name: game.name,
    publisher: game.publisher,
    inPrint: game.inPrint,
    languages: game.languages,
    seriesCount: game.series.length,
    setCount: game.sets.length,
    series: game.series,
    sets: game.sets,
  };
  const dest = ccgtraderSetsLedgerWritePath(opts.packId);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return ledger;
}
