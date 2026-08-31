/**
 * CardGameClub Magento singles titles (IT Carddass S1–S5).
 * Shop copy prints NI/TE/ST/CL + the Italian name. ST → ta on disk.
 */
import {
  canonicalizeNarutoPrintKey,
  mintNarutoPrintKey,
  narutoDiskCardId,
  parseNarutoCollector,
} from "../collectorIdentity";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { cardTypeFromCollectorNumber } from "./parseBandaicgAsset";
import { colekaCarddassPrefixToCollector } from "./parseColekaS6It";
import curated from "../curated/sources/cardgameclub-it-cardlist.json";

export type CardgameclubItCard = {
  number: string;
  name: string;
  setCode: string;
  printedRef: string;
};

export type CardgameclubItFace = CardgameclubItCard & {
  /** Wayback or live Magento product thumbnail (300×375). */
  imageUrl: string;
};

const DATA_NAME_RE = /data-name="((?:NI|TE|TA|ST|CL)[-\s]?\d{1,3}\s+[^"]+)"/gi;

const LINK_TITLE_RE =
  /product-item-link[^>]*>\s*((?:NI|TE|TA|ST|CL)[-\s]?\d{1,3}\s+[^<]{2,120})\s*</gi;

const SMALL_IMAGE_RE =
  /((?:https:\/\/web\.archive\.org\/web\/\d+im_\/https:\/\/)?(?:media\.)?cardgame-?club\.it\/catalog\/product\/cache\/1\/small_image\/300x375\/[^"]+\.jpg)/i;

const LEGACY_IMAGE_RE =
  /((?:https:\/\/web\.archive\.org\/web\/\d+im_\/https:\/\/)?(?:www\.)?cardgame-club\.it\/media\/catalog\/product\/cache\/[^"]+\.jpg)/i;

const TITLE_RE =
  /^(NI|TE|TA|ST|CL)[-\s]?(\d{1,3})\s+(.+?)(?:\s+(?:comune|non comune|rara|ultra rara|epica|holo|foil).*)?$/i;

export function cardgameclubItCuratedCards(): CardgameclubItCard[] {
  return curated.cards as CardgameclubItCard[];
}

export function parseCardgameclubItTitle(
  raw: string,
  setCode: string,
): CardgameclubItCard | null {
  const cleaned = raw
    .replace(/\s*-\s*(?:NEAR\s+)?MINT-?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const m = TITLE_RE.exec(cleaned);
  if (!m) return null;
  const printedRef = `${m[1]!.toUpperCase()}-${m[2]}`;
  const number = colekaCarddassPrefixToCollector(printedRef);
  if (!number) return null;
  const name = m[3]!.replace(/\s+/g, " ").trim();
  if (!name) return null;
  return { number, name, setCode, printedRef };
}

/** Magento listing blocks: `data-name` / product link + thumbnail. */
export function parseCardgameclubItListingFaces(
  html: string,
  setCode: string,
): CardgameclubItFace[] {
  const byNumber = new Map<string, CardgameclubItFace>();
  for (const block of html.split("product-item-info").slice(1)) {
    let titleRaw: string | null = null;
    const dataName = block.match(
      /data-name="((?:NI|TE|TA|ST|CL)[-\s]?\d{1,3}\s+[^"]+)"/i,
    );
    if (dataName) titleRaw = dataName[1]!;
    if (!titleRaw) {
      const link = LINK_TITLE_RE.exec(block);
      if (link) titleRaw = link[1]!.trim();
    }
    if (!titleRaw) continue;
    const imgMatch = SMALL_IMAGE_RE.exec(block) ?? LEGACY_IMAGE_RE.exec(block);
    if (!imgMatch) continue;
    const row = parseCardgameclubItTitle(titleRaw, setCode);
    if (!row || byNumber.has(row.number)) continue;
    const rawUrl = imgMatch[1]!;
    byNumber.set(row.number, {
      ...row,
      imageUrl: rawUrl.startsWith("http")
        ? rawUrl
        : rawUrl.startsWith("catalog/")
          ? `https://media.cardgame-club.it/${rawUrl}`
          : `https://${rawUrl.replace(/^\/+/, "")}`,
    });
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
}

export function parseCardgameclubItListing(
  html: string,
  setCode: string,
): CardgameclubItCard[] {
  const byNumber = new Map<string, CardgameclubItCard>();
  for (const match of html.matchAll(DATA_NAME_RE)) {
    const row = parseCardgameclubItTitle(match[1]!, setCode);
    if (!row || byNumber.has(row.number)) continue;
    byNumber.set(row.number, row);
  }
  for (const match of html.matchAll(LINK_TITLE_RE)) {
    const row = parseCardgameclubItTitle(match[1]!.trim(), setCode);
    if (!row || byNumber.has(row.number)) continue;
    byNumber.set(row.number, row);
  }
  for (const match of html.matchAll(
    />\s*(NI|TE|TA|ST|CL)[-\s]?\d{1,3}\s+[^<]{2,80}</gi,
  )) {
    const row = parseCardgameclubItTitle(match[0].slice(1, -1).trim(), setCode);
    if (!row || byNumber.has(row.number)) continue;
    byNumber.set(row.number, row);
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
}

export function mergeCardgameclubItCardsIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  cards: readonly CardgameclubItCard[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleKeys = new Set(
    titles.map(
      (t) =>
        `${canonicalizeNarutoPrintKey(t.printKey)}\0${t.lang.toLowerCase()}`,
    ),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of input.cards) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey) continue;
    const diskId = narutoDiskCardId(row.number) ?? row.number;
    const parsed = parseNarutoCollector(row.number);
    if (!printByKey.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: row.setCode,
        number: diskId,
        cardType: cardTypeFromCollectorNumber(diskId),
        family: parsed?.family ?? null,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }
    const titleKey = `${printKey}\0it`;
    if (titleKeys.has(titleKey)) continue;
    titles.push({ printKey, lang: "it", fullName: row.name.trim() });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}
