/**
 * Moisson des noms FR carddass.fr/dbz (Wayback) → ledger durable.
 * Couvre Part 1 (D-001…D-134) — seules fiches HTML archivées.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import { dbsJccCuratedDir } from "../pack";
import {
  parseCarddassFrCardPageName,
  printedFromCarddassFrCardPath,
} from "../parse/carddassFrNames";

export type CarddassFrNameRow = {
  printed: string;
  number: string;
  /** Series folder implied by the era of these HTML dumps — always part1. */
  setHint: "part1";
  name: string;
  waybackUrl: string;
  timestamp: string;
};

const SCOUT_CDX = path.join(
  dbsJccCuratedDir(),
  "sources",
  "wayback",
  "carddass_fr_db_.json",
);

export function dbsJccCarddassFrNamesLedgerPath(): string {
  return path.join(dbsJccCuratedDir(), "sources", "carddass-fr-dbz-names.json");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cardPagesFromScout(): Array<{
  timestamp: string;
  original: string;
  waybackUrl: string;
}> {
  if (!existsSync(SCOUT_CDX)) return [];
  const rows = JSON.parse(readFileSync(SCOUT_CDX, "utf8")) as Array<{
    timestamp: string;
    original: string;
  }>;
  const best = new Map<
    string,
    { timestamp: string; original: string; waybackUrl: string }
  >();
  for (const row of rows) {
    const printed = printedFromCarddassFrCardPath(row.original);
    if (!printed) continue;
    const prev = best.get(printed.number);
    // Prefer later capture when several exist.
    if (prev && prev.timestamp >= row.timestamp) continue;
    best.set(printed.number, {
      timestamp: row.timestamp,
      original: row.original,
      waybackUrl: `https://web.archive.org/web/${row.timestamp}id_/${row.original}`,
    });
  }
  return [...best.values()].sort((a, b) =>
    a.original.localeCompare(b.original),
  );
}

export async function harvestCarddassFrDbzNames(opts?: {
  /** Cap for tests / dry runs. */
  limit?: number;
  delayMs?: number;
}): Promise<{ names: number; path: string; rows: CarddassFrNameRow[] }> {
  const outPath = dbsJccCarddassFrNamesLedgerPath();
  mkdirSync(path.dirname(outPath), { recursive: true });
  const pages = cardPagesFromScout().slice(
    0,
    opts?.limit && opts.limit > 0 ? opts.limit : undefined,
  );
  const delayMs = opts?.delayMs ?? 200;
  const rows: CarddassFrNameRow[] = [];

  for (const page of pages) {
    const printed = printedFromCarddassFrCardPath(page.original);
    if (!printed) continue;
    try {
      const res = await httpGet<string>(page.waybackUrl, {
        responseType: "text",
        timeout: 40_000,
        validateStatus: (status) => status === 200,
      });
      const html = typeof res.data === "string" ? res.data : "";
      const name = parseCarddassFrCardPageName(html);
      if (name) {
        rows.push({
          printed: printed.printed,
          number: printed.number,
          setHint: "part1",
          name,
          waybackUrl: page.waybackUrl,
          timestamp: page.timestamp,
        });
      }
    } catch {
      /* skip missing captures */
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  rows.sort((a, b) => a.number.localeCompare(b.number, "en", { numeric: true }));
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        source: "carddass.fr/dbz Wayback card pages",
        lang: "fr",
        observed: new Date().toISOString().slice(0, 10),
        url: "http://www.carddass.fr/dbz/",
        note: "Part 1 only (D-001.htm…D-134.htm). Official Bandai France names.",
        names: rows,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { names: rows.length, path: outPath, rows };
}
