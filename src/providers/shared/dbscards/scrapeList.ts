/**
 * Crawl a dbscards site's card list into `data/<pack>/dbscards-<lang>.json`.
 *
 * One request per list page yields thirty cards with their real page URL, their
 * rarity-qualified code, their price with its thirty-day move where the site
 * quotes one, and both face URLs — see `tile`. That is most of what a card page
 * holds, at a thirtieth of the requests, which is why this pass exists at all:
 * the detail crawl is thousands of requests against a host that tarpits, and
 * this one is hundreds.
 *
 * Two sites run the same software — Masters on `www`, Fusion World on `fw` —
 * so the pack and the site are both arguments and nothing here knows which
 * game it is reading.
 *
 * Sequential, like every other scrape here: this host banned us for an evening
 * when a pass went parallel.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { foilPackDataDir } from "@/lib/runtimeData";

import {
  DBSCARDS_SITES,
  dbscardsListPageUrl,
  parseDbscardsListPage,
  type DbscardsIndexEntry,
  type DbscardsSite,
} from "./list";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** Stop after this many consecutive pages yield nothing. */
const EMPTY_STREAK_STOP = 2;
const PAGE_TIMEOUT_MS = 60_000;
/** Between pages. Modest, but this host has form. */
const DEFAULT_DELAY_MS = 300;

export function dbscardsIndexPath(packId: string, lang = "fr"): string {
  return path.join(
    foilPackDataDir(packId),
    `dbscards-${lang.toLowerCase()}.json`,
  );
}

/**
 * Pokémon paper faces from pkmcards.fr use the same crawl, different basename —
 * `dbscards-fr.json` next to Live data would read as Masters residue.
 */
export function pkmcardsIndexPath(lang = "fr"): string {
  return path.join(
    foilPackDataDir("pokemon"),
    `pkmcards-${lang.toLowerCase()}.json`,
  );
}

/** Card-list site row for pkmcards.fr (same tile markup as dbscards). */
export const PKMCARDS_CARD_SITE: DbscardsSite = {
  id: "pkmcards",
  origin: "https://www.pkmcards.fr",
  lists: {
    fr: "/cards/liste-cartes-francaises",
  },
};

export type ScrapeDbscardsIndexResult = {
  lang: string;
  cards: number;
  pages: number;
  /** How many carried a price — Fusion World quotes none at all. */
  priced: number;
  /** How many carried a verso, i.e. Leaders. */
  withBack: number;
  file: string;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function scrapeDbscardsIndex(opts: {
  /** Where the file lands, e.g. `dbs/cg` or `dbs/fw`. */
  packId: string;
  /** Which locale's list to read. Each site publishes one per language. */
  lang?: string;
  site?: DbscardsSite;
  maxPages?: number;
  delayMs?: number;
  /** Full path override (e.g. `pkmcards-fr.json` for Pokémon). */
  indexPath?: string;
  onProgress?: (page: number, total: number) => void;
}): Promise<ScrapeDbscardsIndexResult> {
  const site = opts.site ?? DBSCARDS_SITES.masters;
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
      /*
        Through the shared client, not bare `fetch`: it carries the ambient job
        abort signal, so cancelling this crawl from the admin actually closes
        its sockets instead of leaving a worker slot held until timeout.
      */
      const res = await httpGet<string>(dbscardsListPageUrl(page, lang, site), {
        headers: { "User-Agent": UA },
        responseType: "text",
        timeout: PAGE_TIMEOUT_MS,
        validateStatus: (status) => status === 200,
      });
      rows = parseDbscardsListPage(
        typeof res.data === "string" ? res.data : String(res.data),
      );
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
  const file = opts.indexPath ?? dbscardsIndexPath(opts.packId, lang);
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
