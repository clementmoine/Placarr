/**
 * Bandai europe-fr cardlist HTML → structured cards.
 *
 * The search form POSTs to `/europe-fr/cartes/index.php?search=true`. Each
 * `<li>` is one print; Leaders add a `.cardBack` sibling with the awakened
 * face (`_b.png`) — that is a verso of the same print, not a second card.
 */
import { decode as decodeHTMLEntities } from "html-entities";

import {
  dbsPrintKey,
  formatDbsCollectorNumber,
  parseDbsCollectorNumber,
} from "./printIdentity";

export const DBS_CG_CARDLIST_ORIGIN = "https://www.dbs-cardgame.com";
export const DBS_CG_CARDLIST_PATH = "/europe-fr/cartes/";
export const DBS_CG_SEARCH_URL = `${DBS_CG_CARDLIST_ORIGIN}${DBS_CG_CARDLIST_PATH}index.php?search=true`;
export const DBS_CG_INDEX_URL = `${DBS_CG_CARDLIST_ORIGIN}${DBS_CG_CARDLIST_PATH}`;

const SEARCH_BASE = `${DBS_CG_CARDLIST_ORIGIN}${DBS_CG_CARDLIST_PATH}`;

export type DbsSeriesOption = {
  categoryId: string;
  label: string;
};

export type DbsParsedCard = {
  /** As printed: `BT1-001` or `BT1-011_SPR`. */
  cardNumber: string;
  setCode: string;
  number: string;
  grouping: string | null;
  printKey: string;
  name: string;
  awakenedName: string | null;
  setName: string | null;
  rarity: string | null;
  cardType: string | null;
  color: string | null;
  character: string | null;
  power: string | null;
  imageUrl: string | null;
  backImageUrl: string | null;
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

export function resolveCardlistUrl(
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

function dlDd(html: string, className: string): string | null {
  const match = html.match(
    new RegExp(`<dl class="${className}"[\\s\\S]*?<dd>([\\s\\S]*?)</dd>`, "i"),
  );
  if (!match) return null;
  const text = stripHtml(match[1]!);
  return text || null;
}

function parseFace(html: string): {
  cardNumber: string | null;
  name: string | null;
  imageUrl: string | null;
  setName: string | null;
  rarity: string | null;
  cardType: string | null;
  color: string | null;
  character: string | null;
  power: string | null;
} {
  const numberMatch = html.match(/<dt class="cardNumber">([^<]+)<\/dt>/i);
  const nameMatch = html.match(/<dd class="cardName">([\s\S]*?)<\/dd>/i);
  const imgMatch = html.match(
    /<div class="cardimg">[\s\S]*?<img[^>]+src="([^"]+)"/i,
  );
  return {
    cardNumber: numberMatch ? stripHtml(numberMatch[1]!) : null,
    name: nameMatch ? stripHtml(nameMatch[1]!) : null,
    imageUrl: resolveCardlistUrl(imgMatch?.[1]),
    setName: dlDd(html, "seriesCol"),
    rarity: dlDd(html, "rarityCol"),
    cardType: dlDd(html, "typeCol"),
    color: dlDd(html, "colorCol"),
    character: dlDd(html, "characterCol"),
    power: dlDd(html, "powerCol"),
  };
}

function parseListItem(liHtml: string): DbsParsedCard | null {
  const parts = liHtml.split(/<div class="cardBack">/i);
  const front = parseFace(parts[0] ?? "");
  if (!front.cardNumber || !front.name) return null;
  const parsed = parseDbsCollectorNumber(front.cardNumber);
  const printKey = dbsPrintKey(front.cardNumber);
  if (!parsed || !printKey) return null;

  const back = parts[1] ? parseFace(parts[1]) : null;
  const awakened = back?.name && back.name !== front.name ? back.name : null;

  return {
    cardNumber: formatDbsCollectorNumber(
      parsed.set,
      parsed.number,
      parsed.grouping,
    ),
    setCode: parsed.set,
    number: parsed.number,
    grouping: parsed.grouping,
    printKey,
    name: front.name,
    awakenedName: awakened,
    setName: front.setName,
    rarity: front.rarity,
    cardType: front.cardType,
    color: front.color,
    character: front.character,
    power: front.power,
    imageUrl: front.imageUrl,
    backImageUrl: back?.imageUrl ?? null,
    sourceUrl: DBS_CG_SEARCH_URL,
  };
}

/** Every print in a cardlist result page. Duplicate `<li>` (front listed twice) collapse by printKey. */
export function parseDbsCardlistHtml(html: string): DbsParsedCard[] {
  const cards: DbsParsedCard[] = [];
  const seen = new Set<string>();
  const listItems = html.matchAll(/<li>([\s\S]*?)<\/li>/gi);
  for (const match of listItems) {
    const card = parseListItem(match[1] ?? "");
    if (!card || seen.has(card.printKey)) continue;
    seen.add(card.printKey);
    cards.push(card);
  }
  return cards;
}

/** Series `<select name="category_exp">` — numeric Bandai category ids only. */
export function parseDbsSeriesOptions(html: string): DbsSeriesOption[] {
  const select = html.match(
    /<select[^>]*name="category_exp"[^>]*>([\s\S]*?)<\/select>/i,
  );
  if (!select) return [];
  const options: DbsSeriesOption[] = [];
  for (const match of select[1]!.matchAll(
    /<option[^>]*value="(\d+)"[^>]*>([\s\S]*?)<\/option>/gi,
  )) {
    const label = stripHtml(match[2] ?? "");
    if (!label) continue;
    options.push({ categoryId: match[1]!, label });
  }
  return options;
}
