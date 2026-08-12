/**
 * Build `data/pokemon/catalog.sqlite` from config-cache card-database files.
 */

import fs from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

import {
  collectIdentitiesFromConfigCache,
  writeLiveCardsSqlite,
  writeLiveFoilMasksJson,
} from "./cardDatabase";

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  return undefined;
}

export type IndexLiveCardsOptions = {
  configCache?: string;
  out?: string;
  root?: string;
};

export function indexLiveCards(opts: IndexLiveCardsOptions = {}): {
  ok: true;
  meta: Record<string, unknown>;
} {
  const root = opts.root ?? path.resolve(dataRoot(), "..");
  const cache = path.resolve(
    opts.configCache ??
      path.join(root, "data", "pokemon", "staging", "config-cache"),
  );
  const out = path.resolve(
    opts.out ?? path.join(root, "data", "pokemon", "catalog.sqlite"),
  );

  if (!fs.existsSync(cache) || !fs.statSync(cache).isDirectory()) {
    throw new Error(`missing config-cache: ${cache}`);
  }
  const rows = collectIdentitiesFromConfigCache(cache);
  if (!rows.length) {
    throw new Error(`no card-database identities in ${cache}`);
  }
  const meta = writeLiveCardsSqlite(rows, out);
  const foilMasks = writeLiveFoilMasksJson(
    rows,
    path.join(root, "data", "pokemon", "liveFoilMasks.json"),
  );
  return { ok: true, meta: { ...meta, foilMasks } };
}

/** CLI-friendly entry (exit codes). */
export function main(argv: string[] = process.argv.slice(2)): number {
  try {
    const result = indexLiveCards({
      root: argValue(argv, "--repo"),
      configCache: argValue(argv, "--config-cache"),
      out: argValue(argv, "--out"),
    });
    console.log(JSON.stringify(result.meta, null, 2));
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    if (message.startsWith("missing config-cache")) return 2;
    return 1;
  }
}
