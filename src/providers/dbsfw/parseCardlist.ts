/**
 * Bandai Fusion World cardlist HTML (`fw/en/cardlist/`) → structured cards.
 *
 * Categories are `<a data-val="583301">… [ST01]</a>`. Each print is a
 * `.cardItem` whose `detail.php?card_no=` carries the collector number and
 * optional `p=_p1` parallel. Leader faces use `_f` in the filename — that is
 * the same print, not a grouping. `_p1` is.
 */
import { decode as decodeHTMLEntities } from "html-entities";

import {
  dbsFwPrintKey,
  formatDbsFwCollectorNumber,
  normalizeDbsFwParallel,
  parseDbsFwCollectorNumber,
} from "./printIdentity";

export const DBS_FW_CARDLIST_ORIGIN = "https://www.dbs-cardgame.com";

/**
 * Every locale Bandai publishes this game in.
 *
 * Five of them, not one — the pack shipped reading `/fw/en/` alone and calling
 * that the catalogue. The Japanese path is `/fw/jp/`, which is worth writing
 * down: probing `/fw/ja/` returns 404 and reads as "Bandai publishes no
 * Japanese", which is how this stayed English-only.
 *
 * Category ids differ per locale, so each list is discovered from its own
 * index page rather than reusing another's.
 *
 * `lang` is our id, not theirs. `asia-en` earns its place by being the odd one
 * out: it is the **Japanese printing carrying an English name**, so it is the
 * one locale that shows a Japanese card readably. `/fw/jp/` and `/fw/asia-tc/`
 * name the same cards 孫悟天 and 克林 — real localisations, and useless to a
 * reader who wants Roman script.
 */
export const DBS_FW_CARDLIST_LOCALES = {
  en: { lang: "en", path: "/fw/en/cardlist/" },
  "asia-en": { lang: "asia-en", path: "/fw/asia-en/cardlist/" },
  jp: { lang: "ja", path: "/fw/jp/cardlist/" },
  "asia-tc": { lang: "asia-tc", path: "/fw/asia-tc/cardlist/" },
  "asia-th": { lang: "asia-th", path: "/fw/asia-th/cardlist/" },
} as const;

export type DbsFwLocaleId = keyof typeof DBS_FW_CARDLIST_LOCALES;

/**
 * What a run reads unless told otherwise: the two Roman-script catalogues.
 *
 * `en` is the English printing, `asia-en` the Japanese one named in English.
 * Between them every Fusion World card is listed once, readably. The CJK and
 * Thai locales stay reachable through `--locales` for the day a script other
 * than Latin is wanted.
 */
export const DBS_FW_DEFAULT_LOCALES = ["en", "asia-en"] as const;

/**
 * Where a locale's faces live on Bandai's CDN.
 *
 * Only two pools exist: English printings under `/card/en/`, everything else —
 * Japanese, Asia-English, Traditional Chinese, Thai — under `/card/jp/`,
 * because those markets print the Japanese card and translate only the
 * catalogue text. Measured on ST01: four locales, one set of image URLs.
 */
export function dbsFwFacePool(lang: string): "en" | "ja" {
  return lang.toLowerCase() === "en" ? "en" : "ja";
}

export function dbsFwCardlistUrls(locale: DbsFwLocaleId = "en"): {
  lang: string;
  index: string;
  base: string;
} {
  const { lang, path } = DBS_FW_CARDLIST_LOCALES[locale];
  const index = `${DBS_FW_CARDLIST_ORIGIN}${path}`;
  return { lang, index, base: index };
}

/** @deprecated Prefer {@link dbsFwCardlistUrls}. Kept for existing imports. */
export const DBS_FW_CARDLIST_PATH = DBS_FW_CARDLIST_LOCALES.en.path;
export const DBS_FW_INDEX_URL = dbsFwCardlistUrls("en").index;

const SEARCH_BASE = DBS_FW_INDEX_URL;

export type DbsFwSeriesOption = {
  categoryId: string;
  label: string;
};

export type DbsFwParsedCard = {
  cardNumber: string;
  setCode: string;
  number: string;
  grouping: string | null;
  printKey: string;
  name: string;
  setName: string | null;
  imageUrl: string | null;
  sourceUrl: string;
};

export function stripHtml(value: string): string {
  return decodeHTMLEntities(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function resolveFwCardlistUrl(
  src: string | null | undefined,
  base = SEARCH_BASE,
): string | null {
  const trimmed = src?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed, base).href;
  } catch {
    return null;
  }
}

function nameFromAlt(alt: string, cardNumber: string): string {
  const stripped = stripHtml(alt);
  const prefix = new RegExp(
    `^${cardNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`,
    "i",
  );
  return stripped.replace(prefix, "").trim() || stripped;
}

function parseCardItem(
  html: string,
  setName: string | null,
): DbsFwParsedCard | null {
  const detail = html.match(
    /data-src="detail\.php\?([^"]+)"/i,
  );
  if (!detail) return null;
  const params = new URLSearchParams(detail[1]!.replace(/&amp;/g, "&"));
  const cardNo = params.get("card_no")?.trim();
  if (!cardNo) return null;
  const parallel = normalizeDbsFwParallel(params.get("p"));
  const parsed = parseDbsFwCollectorNumber(cardNo);
  const printKey = dbsFwPrintKey(cardNo, parallel);
  if (!parsed || !printKey) return null;

  const img =
    html.match(/<img[^>]+data-src="([^"]+\.webp)"/i) ??
    html.match(/<img[^>]+src="([^"]+\.webp)"/i);
  const altMatch = html.match(/alt="([^"]*)"/i);
  const name = altMatch ? nameFromAlt(altMatch[1]!, cardNo) : cardNo;

  return {
    cardNumber: formatDbsFwCollectorNumber(
      parsed.set,
      parsed.number,
      parallel ?? parsed.grouping,
    ),
    setCode: parsed.set,
    number: parsed.number,
    grouping: parallel ?? parsed.grouping,
    printKey,
    name,
    setName,
    imageUrl: resolveFwCardlistUrl(img?.[1]),
    sourceUrl: `${DBS_FW_INDEX_URL}?search=true`,
  };
}

export function parseDbsFwCardlistHtml(
  html: string,
  setName?: string | null,
): DbsFwParsedCard[] {
  const cards: DbsFwParsedCard[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(
    /<li class="cardItem">([\s\S]*?)<\/li>/gi,
  )) {
    const card = parseCardItem(match[1] ?? "", setName ?? null);
    if (!card || seen.has(card.printKey)) continue;
    seen.add(card.printKey);
    cards.push(card);
  }
  return cards;
}

/** Category chips: `<a data-val="583301">STORY BOOSTER 01 [ST01]</a>`. */
export function parseDbsFwSeriesOptions(html: string): DbsFwSeriesOption[] {
  const options: DbsFwSeriesOption[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(
    /<a href="javascript:void\(0\);" data-val="(\d+)"[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const categoryId = match[1]!;
    const label = stripHtml(match[2] ?? "");
    if (!label || seen.has(categoryId)) continue;
    seen.add(categoryId);
    options.push({ categoryId, label });
  }
  return options;
}

export function dbsFwSeriesSearchUrl(
  categoryId: string,
  locale: DbsFwLocaleId = "en",
): string {
  const params = new URLSearchParams({
    search: "true",
    "category[0]": categoryId,
  });
  return `${dbsFwCardlistUrls(locale).index}?${params.toString()}`;
}
