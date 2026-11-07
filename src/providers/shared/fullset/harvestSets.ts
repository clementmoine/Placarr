/**
 * Harvest Fullset.fr set index → `data/<pack>/sources/fullset-sets.json`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import {
  packSyncedSourcePath,
  resolvePackSyncedSourcePath,
} from "@/lib/packPaths";

import {
  fullsetSetsIndexUrl,
  parseFullsetSetsHtml,
  type FullsetGameSlug,
  type FullsetSetsLedger,
} from "./parseSets";

const LEDGER_FILE = "fullset-sets.json";
const UA =
  "Mozilla/5.0 (compatible; Placarr/0.1; +https://github.com/) FullsetSetsHarvest";

export function fullsetSetsLedgerReadPath(packId: string): string {
  return resolvePackSyncedSourcePath(packId, LEDGER_FILE);
}

export function fullsetSetsLedgerWritePath(packId: string): string {
  return packSyncedSourcePath(packId, LEDGER_FILE);
}

export async function harvestFullsetSets(opts: {
  packId: string;
  game: FullsetGameSlug;
  signal?: AbortSignal;
}): Promise<FullsetSetsLedger> {
  const url = fullsetSetsIndexUrl(opts.game);
  const res = await httpGet<string>(url, {
    signal: opts.signal,
    timeout: 40_000,
    responseType: "text",
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      Referer: "https://fullset.fr/",
    },
  });
  const html = typeof res.data === "string" ? res.data : "";
  const sets = parseFullsetSetsHtml(html, opts.game);
  if (sets.length === 0) {
    throw new Error(`fullset sets harvest: no rows parsed from ${url}`);
  }
  const ledger: FullsetSetsLedger = {
    source: url,
    observed: new Date().toISOString(),
    game: opts.game,
    sets,
  };
  const dest = fullsetSetsLedgerWritePath(opts.packId);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return ledger;
}
