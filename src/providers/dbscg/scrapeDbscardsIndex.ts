/**
 * Crawl dbscards.fr's own card list into `data/dbs/cg/dbscards-<lang>.json`.
 *
 * One request per list page yields thirty cards with their real page URL, their
 * rarity-qualified code, their price with its thirty-day move, and both face
 * URLs — see `dbscardsTile`. That is most of what a card page holds, at a
 * thirtieth of the requests, which is why this pass exists at all: the detail
 * crawl is 5800 requests against a host that tarpits, and this one is 390.
 *
 * Sequential, like every other scrape here: this host banned us for an evening
 * when a pass went parallel.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { foilPackDataDir } from "@/lib/runtimeData";

import {
  dbscardsListPageUrl,
  parseDbscardsListPage,
  type DbscardsIndexEntry,
} from "./dbscardsIndex";
import { DBS_CG_PACK_ID } from "./indexStore";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** Stop after this many consecutive pages yield nothing. */
const EMPTY_STREAK_STOP = 2;
const PAGE_TIMEOUT_MS = 60_000;
/** Between pages. Modest, but this host has form. */
const DEFAULT_DELAY_MS = 300;

export function dbscardsIndexPath(lang = "fr"): string {
  return path.join(
    foilPackDataDir(DBS_CG_PACK_ID),
    `dbscards-${lang.toLowerCase()}.json`,
  );
}

export type ScrapeDbscardsIndexResult = {
  lang: string;
  cards: number;
  pages: number;
  /** How many carried a price — the share of the catalogue that is quoted. */
  priced: number;
  /** How many carried a verso, i.e. Leaders. */
  withBack: number;
  file: string;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function scrapeDbscardsIndex(
  opts: {
    /** Which locale's list to read. Their site publishes one per language. */
    lang?: string;
    maxPages?: number;
    delayMs?: number;
    onProgress?: (page: number, total: number) => void;
  } = {},
): Promise<ScrapeDbscardsIndexResult> {
  const lang = (opts.lang ?? "fr").toLowerCase();
  const maxPages = opts.maxPages ?? 400;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const all = new Map<string, DbscardsIndexEntry>();
  let empty = 0;
  let lastPage = 0;

  for (let page = 1; page <= maxPages && empty < EMPTY_STREAK_STOP; page++) {
    if (page > 1 && delayMs > 0) await sleep(delayMs);
    let rows: DbscardsIndexEntry[] = [];
    try {
      const res = await fetch(dbscardsListPageUrl(page, lang), {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      });
      if (!res.ok) {
        empty += 1;
        continue;
      }
      rows = parseDbscardsListPage(await res.text());
    } catch {
      // A page that fails is not the end of the list — only a run of empties is.
      empty += 1;
      continue;
    }
    if (rows.length === 0) {
      empty += 1;
      continue;
    }
    empty = 0;
    lastPage = page;
    for (const row of rows) all.set(row.slug, row);
    opts.onProgress?.(page, all.size);
  }

  const entries = [...all.values()];
  const file = dbscardsIndexPath(lang);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(entries, null, 1)}\n`, "utf8");
  return {
    lang,
    cards: entries.length,
    pages: lastPage,
    priced: entries.filter((entry) => entry.price != null).length,
    withBack: entries.filter((entry) => entry.imageBack).length,
    file,
  };
}
