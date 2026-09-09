/**
 * Harvest the Fusion World card detail pages — the data the list page omits.
 *
 * The cardlist walk gives a number, a name and an image, and that is all the
 * catalogue held: **3 962 entrées FW, zéro rareté**. Each card also has a
 * detail page carrying rarity, type, colour, cost, power, traits and the full
 * skill text.
 *
 * Only distinct numbers are fetched: `ST01-001` and `ST01-001-p1` are the same
 * card with a different art, and share one detail page — 1 927 requests instead
 * of 3 962.
 *
 * Written to its own file rather than into `cards-index.json`: the index shape
 * is shared by every pack, and a Fusion World stat block has no business in
 * Lorcana's. Same call as the Naruto `facts-ja.json`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { CardsIndexV1 } from "@/effects/cardsIndex";
import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import {
  dbsFwCardDetailUrl,
  parseDbsFwCardDetail,
  type DbsFwCardDetail,
} from "./parseCardDetail";

export const DBS_FW_PACK_ID = "dbs/fw";
export const DBS_FW_FACTS_FILE = "facts.json";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 400;

export type DbsFwFactsFile = {
  version: 1;
  source: string;
  locale: string;
  capturedAt: string;
  count: number;
  /** Keyed by printed number (`ST01-001`). */
  cards: Record<string, DbsFwCardDetail>;
};

export type ScrapeDbsFwDetailsOptions = {
  root?: string;
  locale?: string;
  delayMs?: number;
  /** Stop after this many cards — for a first proving pass. */
  limit?: number;
  /** Re-fetch numbers already in the facts file. */
  force?: boolean;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function packRoot(root?: string): string {
  return path.join(root ?? dataRoot(), DBS_FW_PACK_ID);
}

export function dbsFwFactsPath(root?: string): string {
  return path.join(packRoot(root), DBS_FW_FACTS_FILE);
}

export function loadDbsFwFacts(root?: string): DbsFwFactsFile | null {
  try {
    const raw = JSON.parse(
      readFileSync(dbsFwFactsPath(root), "utf8"),
    ) as DbsFwFactsFile;
    return raw?.version === 1 && raw.cards ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Distinct printed numbers behind the index entries.
 * `st01-001` and `st01-001-p1` are one card, one detail page.
 */
export function dbsFwDetailNumbers(index: CardsIndexV1): string[] {
  const numbers = new Set<string>();
  for (const card of Object.values(index.cards)) {
    const set = (card.set ?? "").trim();
    const number = (card.card ?? "").trim();
    if (!set || !number) continue;
    numbers.add(`${set}-${number}`.replace(/-p\d+$/i, "").toUpperCase());
  }
  return [...numbers].sort((a, b) => a.localeCompare(b));
}

async function fetchDetail(
  url: string,
  delayMs: number,
): Promise<string | null> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await httpGet<string>(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,*/*",
          Referer: "https://www.dbs-cardgame.com/fw/en/cardlist/",
        },
        responseType: "text",
        timeout: 20_000,
        validateStatus: (status) => status === 200,
      });
      return typeof res.data === "string" ? res.data : "";
    } catch {
      if (attempt === 3) return null;
      await sleep(Math.max(delayMs, 500) * attempt * 2);
    }
  }
  return null;
}

export async function scrapeDbsFwCardDetails(
  opts: ScrapeDbsFwDetailsOptions = {},
): Promise<{ listed: number; fetched: number; failed: number; file: string }> {
  const root = packRoot(opts.root);
  const locale = opts.locale ?? "en";
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const indexPath = path.join(root, "cards-index.json");
  if (!existsSync(indexPath)) {
    throw new Error(`cards-index.json absent: ${indexPath}`);
  }
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as CardsIndexV1;
  let numbers = dbsFwDetailNumbers(index);

  const held = opts.force ? null : loadDbsFwFacts(opts.root);
  const cards: Record<string, DbsFwCardDetail> = { ...(held?.cards ?? {}) };
  if (held) numbers = numbers.filter((n) => !cards[n]);
  if (opts.limit && opts.limit > 0) numbers = numbers.slice(0, opts.limit);

  console.log(
    `── FW détails → ${DBS_FW_FACTS_FILE} (${numbers.length} fiches à lire, ${Object.keys(cards).length} déjà tenues)`,
  );

  let fetched = 0;
  let failed = 0;
  for (const number of numbers) {
    if (delayMs > 0) await sleep(delayMs);
    const html = await fetchDetail(dbsFwCardDetailUrl(number, locale), delayMs);
    const card = html ? parseDbsFwCardDetail(html) : null;
    if (!card) {
      failed += 1;
      continue;
    }
    cards[number] = card;
    fetched += 1;
    if (fetched % 100 === 0) console.log(`   FW ${fetched} fiches…`);
  }

  const file: DbsFwFactsFile = {
    version: 1,
    source: "https://www.dbs-cardgame.com/fw/<locale>/cardlist/detail.php",
    locale,
    capturedAt: new Date().toISOString(),
    count: Object.keys(cards).length,
    cards,
  };
  mkdirSync(root, { recursive: true });
  const dest = dbsFwFactsPath(opts.root);
  writeFileSync(dest, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify({
      dbsFwDetails: true,
      listed: numbers.length,
      fetched,
      failed,
      total: file.count,
    }),
  );
  return { listed: numbers.length, fetched, failed, file: dest };
}
