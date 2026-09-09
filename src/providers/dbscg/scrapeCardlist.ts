/**
 * Scrape Bandai FR + EN cardlists → `data/dbs/cg/catalog.sqlite`.
 *
 * Category ids differ per locale — each list is fetched on its own and
 * merged on printKey. Titles and SAMPLE URLs stay per language. Local
 * faces come from the Deckplanet dump (`fetchFaces`), not this scrape.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { httpGet, httpPost } from "@/lib/http/httpClient";
import { dataPackPath } from "@/providers/shared/catalogCorpus";

import {
  dbsCgCardlistUrls,
  parseDbsCardlistHtml,
  parseDbsSeriesOptions,
  type DbsCardlistLocaleId,
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

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SEARCH_TIMEOUT_MS = 45_000;
const DEFAULT_DELAY_MS = 350;
const DEFAULT_LANGS: readonly DbsCardlistLocaleId[] = ["fr", "en"];

export type ScrapeDbsCgOptions = {
  force?: boolean;
  /** First N series only, per locale (debug). */
  limit?: number;
  delayMs?: number;
  /** Locales to scrape. Default FR then EN. */
  langs?: readonly DbsCardlistLocaleId[];
  /** Skip HTTP; rewrite sqlite from nothing is a no-op unless cards are passed. */
  indexOnly?: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function localeHeaders(locale: DbsCardlistLocaleId): Record<string, string> {
  const acceptLanguage =
    locale === "en" ? "en-US,en;q=0.9" : "fr-FR,fr;q=0.9,en;q=0.8";
  return {
    "User-Agent": UA,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": acceptLanguage,
  };
}

/**
 * Collapse locale batches onto one print row; keep every language's title
 * and SAMPLE URL. First locale to mention a print owns `sourceUrl`.
 */
export function rowsFromCards(cards: readonly DbsParsedCard[]): {
  prints: DbsPrintRow[];
  titles: DbsTitleRow[];
  assets: DbsAssetRow[];
} {
  const prints: DbsPrintRow[] = [];
  const titles: DbsTitleRow[] = [];
  const assets: DbsAssetRow[] = [];
  const seenPrint = new Set<string>();
  const seenTitle = new Set<string>();
  const seenAsset = new Set<string>();
  for (const card of cards) {
    const lang = card.lang || "fr";
    if (!seenPrint.has(card.printKey)) {
      seenPrint.add(card.printKey);
      prints.push({
        printKey: card.printKey,
        setCode: card.setCode,
        number: card.number,
        grouping: card.grouping,
        cardType: card.cardType,
        sourceUrl: card.sourceUrl,
      });
    }
    const titleKey = `${card.printKey}:${lang}`;
    if (!seenTitle.has(titleKey)) {
      seenTitle.add(titleKey);
      titles.push({
        printKey: card.printKey,
        lang,
        fullName: card.name,
        rarity: card.rarity,
        setName: card.setName,
        color: card.color,
        character: card.character,
        power: card.power,
        awakenedName: card.awakenedName,
      });
    }
    const assetKey = `${card.printKey}:${lang}`;
    if (!seenAsset.has(assetKey)) {
      seenAsset.add(assetKey);
      assets.push({
        printKey: card.printKey,
        lang,
        imageUrl: card.imageUrl,
        backUrl: card.backImageUrl,
      });
    }
  }
  return { prints, titles, assets };
}

async function fetchIndexHtml(locale: DbsCardlistLocaleId): Promise<string> {
  const urls = dbsCgCardlistUrls(locale);
  const response = await httpGet<string>(urls.index, {
    headers: localeHeaders(locale),
    timeout: SEARCH_TIMEOUT_MS,
    responseType: "text",
  });
  return typeof response.data === "string"
    ? response.data
    : String(response.data);
}

async function fetchSeriesHtml(
  locale: DbsCardlistLocaleId,
  categoryId: string,
): Promise<string> {
  const urls = dbsCgCardlistUrls(locale);
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
  const response = await httpPost<string>(urls.search, body.toString(), {
    headers: {
      ...localeHeaders(locale),
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: urls.index,
    },
    timeout: SEARCH_TIMEOUT_MS,
    responseType: "text",
  });
  return typeof response.data === "string"
    ? response.data
    : String(response.data);
}

async function scrapeLocale(
  locale: DbsCardlistLocaleId,
  opts: ScrapeDbsCgOptions,
): Promise<{ cards: DbsParsedCard[]; seriesCount: number }> {
  const indexHtml = await fetchIndexHtml(locale);
  let series = parseDbsSeriesOptions(indexHtml);
  if (opts.limit && opts.limit > 0) {
    series = series.slice(0, opts.limit);
  }
  const urls = dbsCgCardlistUrls(locale);
  console.log(
    `── DBS Masters ${locale} — ${series.length} série(s) ${urls.index}`,
  );

  const byKey = new Map<string, DbsParsedCard>();
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;

  for (const [index, option] of series.entries()) {
    const html = await fetchSeriesHtml(locale, option.categoryId);
    const parsed = parseDbsCardlistHtml(html, locale);
    for (const card of parsed) {
      byKey.set(card.printKey, card);
    }
    console.log(
      `   ${locale} ${index + 1}/${series.length} ${option.label} → ${parsed.length} cartes (total ${byKey.size})`,
    );
    if (index < series.length - 1 && delayMs > 0) await sleep(delayMs);
  }

  return { cards: [...byKey.values()], seriesCount: series.length };
}

export async function scrapeDbsCgCardlist(
  opts: ScrapeDbsCgOptions = {},
): Promise<{ printCount: number; seriesCount: number }> {
  if (opts.indexOnly) {
    return { printCount: 0, seriesCount: 0 };
  }

  const langs = opts.langs?.length ? opts.langs : DEFAULT_LANGS;
  const allCards: DbsParsedCard[] = [];
  const seriesByLang: Record<string, number> = {};
  let lastError: unknown;

  for (const locale of langs) {
    try {
      const { cards, seriesCount } = await scrapeLocale(locale, opts);
      allCards.push(...cards);
      seriesByLang[locale] = seriesCount;
    } catch (error) {
      lastError = error;
      console.warn(
        `── cardlist ${locale} : échec — on continue avec les locales déjà lues`,
        error,
      );
    }
  }

  if (!allCards.length) {
    if (lastError) throw lastError;
    return { printCount: 0, seriesCount: 0 };
  }

  const { prints, titles, assets } = rowsFromCards(allCards);
  const seriesCount = Object.values(seriesByLang).reduce((a, b) => a + b, 0);
  const { dbPath, printCount } = writeDbsCgIndex({
    prints,
    titles,
    assets,
    meta: {
      seriesCount: String(seriesCount),
      langs: langs.join(","),
      ...Object.fromEntries(
        Object.entries(seriesByLang).map(([lang, count]) => [
          `seriesCount.${lang}`,
          String(count),
        ]),
      ),
    },
  });
  const indexPath = dataPackPath(DBS_CG_PACK_ID, "cards-index.json");
  exportDbsCgCardsIndexJson(prints, titles, assets, indexPath);
  mkdirSync(path.dirname(dbPath), { recursive: true });
  writeFileSync(
    path.join(path.dirname(indexPath), "scrape-summary.json"),
    `${JSON.stringify({ printCount, seriesCount, seriesByLang, langs, at: new Date().toISOString() })}\n`,
  );
  console.log(`── index ${printCount} prints → ${dbPath}`);
  return { printCount, seriesCount };
}

/** Build sqlite from already-parsed cards (tests / fixtures). */
export function indexDbsCgCards(cards: DbsParsedCard[], dbPath?: string) {
  const { prints, titles, assets } = rowsFromCards(cards);
  return writeDbsCgIndex({ prints, titles, assets, dbPath });
}
