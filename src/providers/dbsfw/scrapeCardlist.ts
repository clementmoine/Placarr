/**
 * Scrape Bandai Fusion World cardlist → `data/dbs/fw/catalog.sqlite`.
 *
 * Faces are not downloaded here: the index stores the official card WebP URLs
 * (SAMPLE watermark), and `fetchFaces` fills the local copies from dbscards.
 * Sleeve back is curated separately (Masters placeholder).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataPackPath } from "@/providers/shared/catalogCorpus";

import {
  DBS_FW_DEFAULT_LOCALES,
  DBS_FW_INDEX_URL,
  dbsFwCardlistUrls,
  dbsFwSeriesSearchUrl,
  parseDbsFwCardlistHtml,
  parseDbsFwSeriesOptions,
  type DbsFwLocaleId,
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
  /** Which of Bandai's five locales to read. Default: all of them. */
  locales?: readonly DbsFwLocaleId[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rowsFromCards(
  cards: DbsFwParsedCard[],
  lang: string,
): {
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
      lang,
      fullName: card.name,
      setName: card.setName,
    });
    assets.push({
      printKey: card.printKey,
      lang,
      imageUrl: card.imageUrl,
    });
  }
  return { prints, titles, assets };
}

async function fetchHtml(url: string, referer = DBS_FW_INDEX_URL): Promise<string> {
  const response = await httpGet<string>(url, {
    headers: { ...HEADERS, Referer: referer },
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
  /*
    Two catalogues, not one. The pack shipped reading `/fw/en/` alone, so 3946
    printings were all English and the Japanese printing — which Bandai also
    publishes named in English, at `/fw/asia-en/` — was absent entirely.

    Printings are shared: a card is one printing whatever language names it, so
    the locales merge on `printKey` and differ only in their title and asset
    rows.
  */
  const locales = opts.locales?.length
    ? opts.locales
    : DBS_FW_DEFAULT_LOCALES;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;

  const prints = new Map<string, DbsFwPrintRow>();
  const titles: DbsFwTitleRow[] = [];
  const assets: DbsFwAssetRow[] = [];
  let seriesCount = 0;

  for (const locale of locales) {
    const urls = dbsFwCardlistUrls(locale);
    const indexHtml = await fetchHtml(urls.index, urls.index);
    let series = parseDbsFwSeriesOptions(indexHtml);
    if (opts.limit && opts.limit > 0) series = series.slice(0, opts.limit);
    seriesCount += series.length;
    console.log(
      `── DBS Fusion World [${locale} → ${urls.lang}] — ${series.length} série(s)`,
    );

    const byKey = new Map<string, DbsFwParsedCard>();
    for (const [index, option] of series.entries()) {
      const html = await fetchHtml(
        dbsFwSeriesSearchUrl(option.categoryId, locale),
        urls.index,
      );
      const parsed = parseDbsFwCardlistHtml(html, option.label);
      for (const card of parsed) byKey.set(card.printKey, card);
      console.log(
        `   ${index + 1}/${series.length} ${option.label} → ${parsed.length} cartes (total ${byKey.size})`,
      );
      if (index < series.length - 1 && delayMs > 0) await sleep(delayMs);
    }

    const rows = rowsFromCards([...byKey.values()], urls.lang);
    for (const print of rows.prints) {
      if (!prints.has(print.printKey)) prints.set(print.printKey, print);
    }
    titles.push(...rows.titles);
    assets.push(...rows.assets);
  }

  const printRows = [...prints.values()];
  const { dbPath, printCount } = writeDbsFwIndex({
    prints: printRows,
    titles,
    assets,
    meta: { locales: locales.join(","), seriesCount: String(seriesCount) },
  });
  const indexPath = dataPackPath(DBS_FW_PACK_ID, "cards-index.json");
  exportDbsFwCardsIndexJson(printRows, titles, assets, indexPath);
  mkdirSync(path.dirname(dbPath), { recursive: true });
  writeFileSync(
    path.join(path.dirname(indexPath), "scrape-summary.json"),
    `${JSON.stringify({ printCount, seriesCount, locales, at: new Date().toISOString() })}\n`,
  );
  console.log(
    `── DBS Fusion World : ${printCount} tirages, ${titles.length} titres sur ${locales.length} locale(s) → ${dbPath}`,
  );
  return { printCount, seriesCount };
}

/** @internal tests — index a parsed batch straight into a database. */
export function indexDbsFwCards(
  cards: DbsFwParsedCard[],
  dbPath?: string,
  lang = "en",
) {
  const { prints, titles, assets } = rowsFromCards(cards, lang);
  return writeDbsFwIndex({ prints, titles, assets, dbPath });
}
