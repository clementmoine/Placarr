/**
 * Collapse leftover series-baked print keys (`naruto:s6-ni064`) onto the
 * printed-prefix key (`naruto:ni-0064`). Same card, one catalogue tile.
 */
import type {
  CardsIndexEntry,
  CardsIndexLangFiles,
  CardsIndexV1,
} from "@/effects/cardsIndex";

import {
  canonicalizeNarutoPrintKey,
  isNarutoFamilyFolder,
  isNarutoSeriesSetCode,
  mintNarutoPrintKey,
  narutoDiskCardId,
  parseNarutoCollector,
} from "./collectorIdentity";
import type {
  NarutoAssetRow,
  NarutoPrintRow,
  NarutoTitleRow,
} from "./indexStore";

const TITLE_STOP =
  /^(qui|que|dont|quand|cette|voici|son|si|une|le|la|les|ce|elle|il|avec|ne|pour|de|du|des|en|au|aux|sur|par|mais|ou|et|car|donc)$/i;

/** Coleka slug when the fiche has no real name (`Carte CL-32`). */
export function isColekaPlaceholderName(name: string): boolean {
  return /^carte\s+[a-z]{1,3}[- ]?\d+$/i.test(name.trim());
}

/** Relative pronoun / empty scrape — not a printed title. */
export function isImplausibleNarutoTitle(name: string): boolean {
  const n = name.trim();
  if (!n) return true;
  if (isColekaPlaceholderName(n)) return true;
  return TITLE_STOP.test(n);
}

export function decodeNarutoHtmlEntities(raw: string): string {
  if (!raw.includes("&")) return raw;
  return raw
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function pickBetterNarutoTitle(
  a?: string | null,
  b?: string | null,
): string | undefined {
  const left = decodeNarutoHtmlEntities(a?.trim() ?? "");
  const right = decodeNarutoHtmlEntities(b?.trim() ?? "");
  const leftOk = left.length > 0 && !isImplausibleNarutoTitle(left);
  const rightOk = right.length > 0 && !isImplausibleNarutoTitle(right);
  if (leftOk && rightOk) return left.length >= right.length ? left : right;
  if (leftOk) return left;
  if (rightOk) return right;
  return undefined;
}

function preferFamilySet(a: string, b: string): string {
  if (isNarutoFamilyFolder(a)) return a;
  if (isNarutoFamilyFolder(b)) return b;
  if (a.toLowerCase() === "s6" && b.toLowerCase() !== "s6") return b;
  if (b.toLowerCase() === "s6" && a.toLowerCase() !== "s6") return a;
  if (isNarutoSeriesSetCode(a) && !isNarutoSeriesSetCode(b)) return b;
  return a;
}

function mergePrintedFlag(
  a: CardsIndexLangFiles,
  b: CardsIndexLangFiles,
): boolean | undefined {
  const aUnprinted = a.printed === false;
  const bUnprinted = b.printed === false;
  if (!aUnprinted && !bUnprinted) return undefined;
  const claimed = (slot: CardsIndexLangFiles, unprinted: boolean) =>
    !unprinted &&
    Boolean(
      slot.art ||
      slot.thumb ||
      (slot.name && !isImplausibleNarutoTitle(slot.name)),
    );
  if (claimed(a, aUnprinted) || claimed(b, bUnprinted)) return undefined;
  return false;
}

function mergeLangFiles(
  a: CardsIndexLangFiles,
  b: CardsIndexLangFiles,
): CardsIndexLangFiles {
  const name = pickBetterNarutoTitle(a.name, b.name);
  const printed = mergePrintedFlag(a, b);
  const out: CardsIndexLangFiles = {
    ...b,
    ...a,
    art: a.art ?? b.art,
    thumb: a.thumb ?? b.thumb,
    back: a.back ?? b.back,
    mask: a.mask ?? b.mask,
    etch: a.etch ?? b.etch,
    varnishMask: a.varnishMask ?? b.varnishMask,
    secondVarnishMask: a.secondVarnishMask ?? b.secondVarnishMask,
    artUrl: a.artUrl ?? b.artUrl,
    variants: a.variants ?? b.variants,
  };
  if (name) out.name = name;
  else delete out.name;
  if (printed === false) out.printed = false;
  else delete out.printed;
  return out;
}

function mergeIndexEntries(
  a: CardsIndexEntry,
  b: CardsIndexEntry,
): CardsIndexEntry {
  const langs: Record<string, CardsIndexLangFiles> = { ...a.langs };
  for (const [lang, files] of Object.entries(b.langs)) {
    langs[lang] = langs[lang] ? mergeLangFiles(langs[lang]!, files) : files;
  }
  const card = narutoDiskCardId(a.card) ?? narutoDiskCardId(b.card) ?? a.card;
  const name = pickBetterNarutoTitle(a.name, b.name);
  const entry: CardsIndexEntry = {
    set: preferFamilySet(a.set, b.set),
    card,
    langs,
  };
  if (name) entry.name = name;
  if (a.rarity || b.rarity) entry.rarity = a.rarity ?? b.rarity;
  return entry;
}

/**
 * Same collector printed twice under old + new keys → one entry.
 * Unique keys (including leftover `s1-ni001`) stay as they are so a stale
 * index still browses; export canonicalizes everything.
 */
export function foldNarutoCardsIndex(index: CardsIndexV1): CardsIndexV1 {
  const groups = new Map<string, Array<[string, CardsIndexEntry]>>();
  for (const [key, entry] of Object.entries(index.cards)) {
    const canon = canonicalizeNarutoPrintKey(key);
    const list = groups.get(canon) ?? [];
    list.push([key, entry]);
    groups.set(canon, list);
  }
  const cards: Record<string, CardsIndexEntry> = {};
  for (const [canon, group] of groups) {
    if (group.length === 1) {
      const [key, entry] = group[0]!;
      cards[key] = entry;
      continue;
    }
    const preferred =
      group.find(([key]) => canonicalizeNarutoPrintKey(key) === canon)?.[1] ??
      group.find(([, entry]) => isNarutoFamilyFolder(entry.set))?.[1] ??
      group[0]![1];
    let merged = preferred;
    for (const [, entry] of group) {
      if (entry === preferred) continue;
      merged = mergeIndexEntries(merged, entry);
    }
    cards[canon] = merged;
  }
  return { ...index, cards };
}

function foldPrintRow(print: NarutoPrintRow): NarutoPrintRow {
  const printKey =
    canonicalizeNarutoPrintKey(print.printKey) ||
    mintNarutoPrintKey(print.number, print.setCode) ||
    print.printKey;
  const parsed = parseNarutoCollector(print.number);
  return {
    ...print,
    printKey,
    number: narutoDiskCardId(print.number, print.setCode) ?? print.number,
    family: print.family ?? parsed?.family ?? null,
    grouping: parsed ? parsed.grouping : (print.grouping ?? null),
  };
}

function mergePrintRow(a: NarutoPrintRow, b: NarutoPrintRow): NarutoPrintRow {
  const aS6 = a.setCode.toLowerCase() === "s6";
  const bS6 = b.setCode.toLowerCase() === "s6";
  const setCode = aS6 && !bS6 ? b.setCode : !aS6 && bS6 ? a.setCode : a.setCode;
  return {
    ...a,
    setCode,
    family: a.family || b.family,
    grouping: a.grouping ?? b.grouping,
    sourceUrl: a.sourceUrl ?? b.sourceUrl,
  };
}

function mergeAssetRow(a: NarutoAssetRow, b: NarutoAssetRow): NarutoAssetRow {
  const claimedPrinted =
    (a.printed !== false && Boolean(a.art || a.thumb)) ||
    (b.printed !== false && Boolean(b.art || b.thumb));
  return {
    ...a,
    art: a.art ?? b.art,
    thumb: a.thumb ?? b.thumb,
    back: a.back ?? b.back,
    sourceUrl: a.sourceUrl ?? b.sourceUrl,
    waybackTimestamp: a.waybackTimestamp ?? b.waybackTimestamp,
    printed: claimedPrinted
      ? a.printed !== false && b.printed !== false
        ? a.printed
        : undefined
      : false,
  };
}

/**
 * Canonicalize every print key and merge duplicates before sqlite / JSON export.
 */
export function foldNarutoCatalogueRecords(input: {
  prints: readonly NarutoPrintRow[];
  titles?: readonly NarutoTitleRow[];
  assets?: readonly NarutoAssetRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  assets: NarutoAssetRow[];
} {
  const printByKey = new Map<string, NarutoPrintRow>();
  for (const raw of input.prints) {
    const print = foldPrintRow(raw);
    const prev = printByKey.get(print.printKey);
    printByKey.set(print.printKey, prev ? mergePrintRow(prev, print) : print);
  }

  const titleByKey = new Map<string, NarutoTitleRow>();
  for (const raw of input.titles ?? []) {
    const printKey = canonicalizeNarutoPrintKey(raw.printKey);
    const lang = raw.lang.toLowerCase();
    const key = `${printKey}\0${lang}`;
    const name = pickBetterNarutoTitle(
      titleByKey.get(key)?.fullName,
      raw.fullName,
    );
    if (!name) {
      titleByKey.delete(key);
      continue;
    }
    const prev = titleByKey.get(key);
    titleByKey.set(key, {
      printKey,
      lang,
      fullName: name,
      rarity: prev?.rarity ?? raw.rarity ?? null,
    });
  }

  const assetByKey = new Map<string, NarutoAssetRow>();
  for (const raw of input.assets ?? []) {
    const printKey = canonicalizeNarutoPrintKey(raw.printKey);
    const key = `${printKey}\0${raw.lang.toLowerCase()}`;
    const next = { ...raw, printKey };
    const prev = assetByKey.get(key);
    assetByKey.set(key, prev ? mergeAssetRow(prev, next) : next);
  }

  return {
    prints: [...printByKey.values()].sort((a, b) =>
      a.printKey.localeCompare(b.printKey),
    ),
    titles: [...titleByKey.values()].sort(
      (a, b) =>
        a.printKey.localeCompare(b.printKey) || a.lang.localeCompare(b.lang),
    ),
    assets: [...assetByKey.values()].sort(
      (a, b) =>
        a.printKey.localeCompare(b.printKey) || a.lang.localeCompare(b.lang),
    ),
  };
}
