/**
 * Scrape Bandai europe-fr cardlist → `data/dbs/cg/catalog.sqlite`.
 *
 * Faces are not downloaded: the index stores the official cardimg URLs
 * (SAMPLE watermark, 260×363). Sleeve back is curated separately.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { httpGet, httpPost } from "@/lib/http/httpClient";
import { dataPackPath } from "@/providers/shared/catalogCorpus";

import {
  DBS_CG_INDEX_URL,
  DBS_CG_SEARCH_URL,
  parseDbsCardlistHtml,
  parseDbsSeriesOptions,
  type DbsParsedCard,
} from "./parseCardlist";
import {
  DBS_CG_PACK_ID,
  exportDbsCgCardsIndexJson,
  writeDbsCgIndex,
  type DbsAssetRow,
  type DbsPrintRow,
  type DbsTitleRow,
} from "./indexStore";

const LANG = "fr";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9",
};
const SEARCH_TIMEOUT_MS = 45_000;
const DEFAULT_DELAY_MS = 350;

export type ScrapeDbsCgOptions = {
  force?: boolean;
  /** First N series only (debug). */
  limit?: number;
  delayMs?: number;
  /** Skip HTTP; rewrite sqlite from nothing is a no-op unless cards are passed. */
  indexOnly?: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rowsFromCards(cards: DbsParsedCard[]): {
  prints: DbsPrintRow[];
  titles: DbsTitleRow[];
  assets: DbsAssetRow[];
} {
  const prints: DbsPrintRow[] = [];
  const titles: DbsTitleRow[] = [];
  const assets: DbsAssetRow[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    if (seen.has(card.printKey)) continue;
    seen.add(card.printKey);
    prints.push({
      printKey: card.printKey,
      setCode: card.setCode,
      number: card.number,
      grouping: card.grouping,
      cardType: card.cardType,
      sourceUrl: card.sourceUrl,
    });
    titles.push({
      printKey: card.printKey,
      lang: LANG,
      fullName: card.name,
      rarity: card.rarity,
      setName: card.setName,
      color: card.color,
      character: card.character,
      power: card.power,
      awakenedName: card.awakenedName,
    });
    assets.push({
      printKey: card.printKey,
      lang: LANG,
      imageUrl: card.imageUrl,
      backUrl: card.backImageUrl,
    });
  }
  return { prints, titles, assets };
}

async function fetchIndexHtml(): Promise<string> {
  const response = await httpGet<string>(DBS_CG_INDEX_URL, {
    headers: HEADERS,
    timeout: SEARCH_TIMEOUT_MS,
    responseType: "text",
  });
  return typeof response.data === "string" ? response.data : String(response.data);
}

async function fetchSeriesHtml(categoryId: string): Promise<string> {
  const body = new URLSearchParams({
    free: "",
    category_exp: categoryId,
    rank: "",
    energy: "",
    comboEnergy: "",
    comboPower: "",
    rarity: "",
    attribute: "",
    character: "",
    character2: "",
    specialTrait: "",
    era: "",
    keywordSkill: "",
  });
  const response = await httpPost<string>(DBS_CG_SEARCH_URL, body.toString(), {
    headers: {
      ...HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: DBS_CG_INDEX_URL,
    },
    timeout: SEARCH_TIMEOUT_MS,
    responseType: "text",
  });
  return typeof response.data === "string" ? response.data : String(response.data);
}

export async function scrapeDbsCgCardlist(
  opts: ScrapeDbsCgOptions = {},
): Promise<{ printCount: number; seriesCount: number }> {
  if (opts.indexOnly) {
    return { printCount: 0, seriesCount: 0 };
  }

  const indexHtml = await fetchIndexHtml();
  let series = parseDbsSeriesOptions(indexHtml);
  if (opts.limit && opts.limit > 0) {
    series = series.slice(0, opts.limit);
  }
  console.log(`── DBS Masters — ${series.length} série(s) Bandai europe-fr`);

  const byKey = new Map<string, DbsParsedCard>();
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;

  for (const [index, option] of series.entries()) {
    const html = await fetchSeriesHtml(option.categoryId);
    const parsed = parseDbsCardlistHtml(html);
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
  const { dbPath, printCount } = writeDbsCgIndex({
    prints,
    titles,
    assets,
    meta: { seriesCount: String(series.length) },
  });
  const indexPath = dataPackPath(DBS_CG_PACK_ID, "cards-index.json");
  exportDbsCgCardsIndexJson(prints, titles, assets, indexPath);
  mkdirSync(path.dirname(dbPath), { recursive: true });
  writeFileSync(
    path.join(path.dirname(indexPath), "scrape-summary.json"),
    `${JSON.stringify({ printCount, seriesCount: series.length, at: new Date().toISOString() })}\n`,
  );
  console.log(`── index ${printCount} prints → ${dbPath}`);
  return { printCount, seriesCount: series.length };
}

/** Build sqlite from already-parsed cards (tests / fixtures). */
export function indexDbsCgCards(cards: DbsParsedCard[], dbPath?: string) {
  const { prints, titles, assets } = rowsFromCards(cards);
  return writeDbsCgIndex({ prints, titles, assets, dbPath });
}
