/**
 * Scrape Bandai Fusion World cardlist → `data/dbs/fw/catalog.sqlite`.
 *
 * Faces are not downloaded: the index stores the official card WebP URLs
 * (SAMPLE watermark). Sleeve back is curated separately (Masters placeholder).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataPackPath } from "@/providers/shared/catalogCorpus";

import {
  DBS_FW_INDEX_URL,
  dbsFwSeriesSearchUrl,
  parseDbsFwCardlistHtml,
  parseDbsFwSeriesOptions,
  type DbsFwParsedCard,
} from "./parseCardlist";
import {
  DBS_FW_PACK_ID,
  exportDbsFwCardsIndexJson,
  writeDbsFwIndex,
  type DbsFwAssetRow,
  type DbsFwPrintRow,
  type DbsFwTitleRow,
} from "./indexStore";

const LANG = "en";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};
const SEARCH_TIMEOUT_MS = 45_000;
const DEFAULT_DELAY_MS = 350;

export type ScrapeDbsFwOptions = {
  force?: boolean;
  limit?: number;
  delayMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rowsFromCards(cards: DbsFwParsedCard[]): {
  prints: DbsFwPrintRow[];
  titles: DbsFwTitleRow[];
  assets: DbsFwAssetRow[];
} {
  const prints: DbsFwPrintRow[] = [];
  const titles: DbsFwTitleRow[] = [];
  const assets: DbsFwAssetRow[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    if (seen.has(card.printKey)) continue;
    seen.add(card.printKey);
    prints.push({
      printKey: card.printKey,
      setCode: card.setCode,
      number: card.number,
      grouping: card.grouping,
      sourceUrl: card.sourceUrl,
    });
    titles.push({
      printKey: card.printKey,
      lang: LANG,
      fullName: card.name,
      setName: card.setName,
    });
    assets.push({
      printKey: card.printKey,
      lang: LANG,
      imageUrl: card.imageUrl,
    });
  }
  return { prints, titles, assets };
}

async function fetchHtml(url: string): Promise<string> {
  const response = await httpGet<string>(url, {
    headers: { ...HEADERS, Referer: DBS_FW_INDEX_URL },
    timeout: SEARCH_TIMEOUT_MS,
    responseType: "text",
  });
  return typeof response.data === "string"
    ? response.data
    : String(response.data);
}

export async function scrapeDbsFwCardlist(
  opts: ScrapeDbsFwOptions = {},
): Promise<{ printCount: number; seriesCount: number }> {
  const indexHtml = await fetchHtml(DBS_FW_INDEX_URL);
  let series = parseDbsFwSeriesOptions(indexHtml);
  if (opts.limit && opts.limit > 0) {
    series = series.slice(0, opts.limit);
  }
  console.log(`── DBS Fusion World — ${series.length} série(s) Bandai fw/en`);

  const byKey = new Map<string, DbsFwParsedCard>();
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;

  for (const [index, option] of series.entries()) {
    const html = await fetchHtml(dbsFwSeriesSearchUrl(option.categoryId));
    const parsed = parseDbsFwCardlistHtml(html, option.label);
    for (const card of parsed) {
      byKey.set(card.printKey, card);
    }
    console.log(
      `   ${index + 1}/${series.length} ${option.label} → ${parsed.length} cartes (total ${byKey.size})`,
    );
    if (index < series.length - 1 && delayMs > 0) await sleep(delayMs);
  }

  const cards = [...byKey.values()];
  const { prints, titles, assets } = rowsFromCards(cards);
  const { dbPath, printCount } = writeDbsFwIndex({
    prints,
    titles,
    assets,
    meta: { seriesCount: String(series.length) },
  });
  const indexPath = dataPackPath(DBS_FW_PACK_ID, "cards-index.json");
  exportDbsFwCardsIndexJson(prints, titles, assets, indexPath);
  mkdirSync(path.dirname(dbPath), { recursive: true });
  writeFileSync(
    path.join(path.dirname(indexPath), "scrape-summary.json"),
    `${JSON.stringify({ printCount, seriesCount: series.length, at: new Date().toISOString() })}\n`,
  );
  console.log(`── index ${printCount} prints → ${dbPath}`);
  return { printCount, seriesCount: series.length };
}

export function indexDbsFwCards(cards: DbsFwParsedCard[], dbPath?: string) {
  const { prints, titles, assets } = rowsFromCards(cards);
  return writeDbsFwIndex({ prints, titles, assets, dbPath });
}
