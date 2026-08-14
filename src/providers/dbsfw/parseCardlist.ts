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
export const DBS_FW_CARDLIST_PATH = "/fw/en/cardlist/";
export const DBS_FW_INDEX_URL = `${DBS_FW_CARDLIST_ORIGIN}${DBS_FW_CARDLIST_PATH}`;

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

export function dbsFwSeriesSearchUrl(categoryId: string): string {
  const params = new URLSearchParams({
    search: "true",
    "category[0]": categoryId,
  });
  return `${DBS_FW_INDEX_URL}?${params.toString()}`;
}
