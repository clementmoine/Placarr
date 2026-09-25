/**
 * Action module: pipeline/index.ts
 * Merged from: foldNarutoIndex.ts, migrateCardLayout.ts, fixThumbs.ts
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type {
  CardsIndexEntry,
  CardsIndexLangFiles,
  CardsIndexV1,
} from "@/effects/cardsIndex";
import { dataRoot } from "@/lib/runtimeData";
import {
  emptyProductsIndex,
  isProductsIndexV1,
  type ProductsIndexV1,
} from "@/providers/shared/sealedProducts/indexFormat";
import {
  isNarutoLangDir,
  listNarutoCardDirs,
  narutoCardRelPath,
  normalizeNarutoLang,
} from "../disk";
import {
  appearanceValueForJson,
  canonicalizeNarutoPrintKey,
  isNarutoFamilyFolder,
  isNarutoSeriesSetCode,
  loadNarutoAppearancesFile,
  mergeAppearanceValues,
  mintNarutoPrintKey,
  narutoCardDiskFolder,
  narutoCatalogueLineForCard,
  narutoDiskCardId,
  NARUTO_LEGACY_EN_CCG_DISK,
  NARUTO_PACK_ID,
  parseNarutoCollector,
  preferNarutoAppearanceSet,
  writeNarutoAppearancesFile,
  type NarutoAppearanceValue,
  type NarutoAppearancesFile,
  type NarutoLangAppearances,
} from "../identity";
import type {
  NarutoAssetRow,
  NarutoPrintRow,
  NarutoTitleRow,
} from "../indexStore";
import { pickPreferredFaceArtFilename } from "../parse/bandai";

export type { NarutoAppearancesFile };

// --- from foldNarutoIndex.ts ---

/**
 * Collapse leftover series-baked print keys (`naruto:s6-ni064`) onto the
 * printed-prefix key (`naruto:ni-0064`). Same card, one catalogue tile.
 */


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
  if (name) {
    out.name = name;
    const winner =
      a.name === name && !a.nameLocaleFrom && !a.nameSource
        ? a
        : b.name === name && !b.nameLocaleFrom && !b.nameSource
          ? b
          : a.name === name
            ? a
            : b.name === name
              ? b
              : !a.nameLocaleFrom && !a.nameSource
                ? a
                : b;
    if (winner.nameLocaleFrom) out.nameLocaleFrom = winner.nameLocaleFrom;
    else delete out.nameLocaleFrom;
    if (winner.nameSource) out.nameSource = winner.nameSource;
    else delete out.nameSource;
  } else {
    delete out.nameLocaleFrom;
    delete out.nameSource;
  }
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
  const setCode = preferNarutoAppearanceSet(a.setCode, b.setCode);
  const setCodes = mergeAppearanceValues(a.setCodes, b.setCodes);
  return {
    ...a,
    setCode,
    ...(setCodes.length ? { setCodes } : {}),
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
    const prev = titleByKey.get(key);
    const name = pickBetterNarutoTitle(prev?.fullName, raw.fullName);
    if (!name) {
      titleByKey.delete(key);
      continue;
    }
    const winner =
      prev && !prev.nameLocaleFrom && !prev.nameSource
        ? prev
        : !raw.nameLocaleFrom && !raw.nameSource
          ? raw
          : (prev ?? raw);
    titleByKey.set(key, {
      printKey,
      lang,
      fullName: name,
      rarity: prev?.rarity ?? raw.rarity ?? null,
      ...(winner.nameLocaleFrom ? { nameLocaleFrom: winner.nameLocaleFrom } : {}),
      ...(winner.nameSource ? { nameSource: winner.nameSource } : {}),
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

// --- from migrateCardLayout.ts ---

/**
 * Plan moves from `cards/{s1}/{fr}/{ni001}` → `cards/ninja/ni0001/fr`.
 * Language versos now live in `curated/cards/back.{lang}.png`. Storm 3 FR
 * stays `n1650`, never `ni1650`.
 */



function physicalPackDir(packId: string): string {
  return path.join(dataRoot(), packId);
}

const LEGACY_SERIES_DIR = /^(s\d+|ns|spc)$/i;

function removeEmptyDirTree(dir: string): boolean {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return false;
  let empty = true;
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (!removeEmptyDirTree(abs)) empty = false;
      continue;
    }
    if (name === ".DS_Store") {
      unlinkSync(abs);
      continue;
    }
    empty = false;
  }
  if (empty) {
    rmdirSync(dir);
    return true;
  }
  return false;
}

function removeEmptyLegacySeriesDirs(cardsDir: string): void {
  if (!existsSync(cardsDir)) return;
  for (const name of readdirSync(cardsDir)) {
    if (!LEGACY_SERIES_DIR.test(name)) continue;
    removeEmptyDirTree(path.join(cardsDir, name));
  }
}

export type NarutoLayoutMove = {
  fromRel: string;
  toRel: string;
  appearanceSet: string;
  lang: string;
  diskId: string;
  family: string;
};


const SKIP_DIR = /^(back|__)/i;

function remapNarutoAppearanceDiskIds(
  appearances: Record<string, NarutoLangAppearances>,
): Record<string, NarutoLangAppearances> {
  const out: Record<string, NarutoLangAppearances> = {};
  for (const [diskId, langs] of Object.entries(appearances)) {
    const dest = narutoDiskCardId(diskId) ?? diskId;
    const merged: NarutoLangAppearances = { ...out[dest] };
    for (const [lang, value] of Object.entries(langs)) {
      merged[lang] = appearanceValueForJson(
        mergeAppearanceValues(merged[lang], value),
      );
    }
    out[dest] = merged;
  }
  return out;
}

export function planNarutoCardMove(
  appearanceSet: string,
  lang: string,
  cardId: string,
): NarutoLayoutMove | null {
  if (isNarutoFamilyFolder(appearanceSet) && appearanceSet !== "promo") {
    return null;
  }
  if (appearanceSet === "promo" && !isNarutoLangDir(lang)) {
    return null;
  }
  const id = parseNarutoCollector(cardId);
  const diskId = narutoDiskCardId(cardId, appearanceSet);
  if (!id || !diskId) return null;
  const destLang = normalizeNarutoLang(lang);
  const folder = narutoCardDiskFolder(id);
  return {
    fromRel: `${appearanceSet}/${lang}/${cardId}`,
    toRel: narutoCardRelPath({
      family: id.family,
      folder,
      diskId,
      lang: destLang,
    }),
    appearanceSet: appearanceSet.toLowerCase(),
    lang: destLang,
    diskId,
    family: folder,
  };
}

/** `ninja/n0122-us/en` → `ninja/nus0122/en` once US is its own prefix. */
export function planNarutoCanonicalDiskRename(
  family: string,
  diskId: string,
  lang: string,
): NarutoLayoutMove | null {
  if (!isNarutoFamilyFolder(family)) return null;
  const parsed = parseNarutoCollector(diskId);
  const destId = narutoDiskCardId(diskId);
  if (!parsed || !destId) return null;
  const destFolder = narutoCardDiskFolder(parsed);
  const destLang = normalizeNarutoLang(lang);
  if (destFolder === family && destId === diskId) return null;
  return {
    fromRel: `${family}/${diskId}/${lang}`,
    toRel: narutoCardRelPath({
      family: parsed.family,
      folder: destFolder,
      diskId: destId,
      lang: destLang,
    }),
    appearanceSet: destFolder,
    lang: destLang,
    diskId: destId,
    family: destFolder,
  };
}

export function planNarutoLayoutMovesFromTree(
  cardsDir: string,
): NarutoLayoutMove[] {
  if (!existsSync(cardsDir)) return [];
  const out: NarutoLayoutMove[] = [];
  for (const set of readdirSync(cardsDir)) {
    if (SKIP_DIR.test(set) || set.includes(".")) continue;
    const setDir = path.join(cardsDir, set);
    if (!statSync(setDir).isDirectory()) continue;
    if (isNarutoFamilyFolder(set)) {
      for (const diskId of readdirSync(setDir)) {
        const cardDir = path.join(setDir, diskId);
        if (!statSync(cardDir).isDirectory()) continue;
        for (const lang of readdirSync(cardDir)) {
          if (!isNarutoLangDir(lang)) continue;
          const langDir = path.join(cardDir, lang);
          if (!statSync(langDir).isDirectory()) continue;
          const move = planNarutoCanonicalDiskRename(set, diskId, lang);
          if (move) out.push(move);
        }
      }
      if (set !== "promo") continue;
    }
    for (const lang of readdirSync(setDir)) {
      const langDir = path.join(setDir, lang);
      if (!statSync(langDir).isDirectory()) continue;
      for (const cardId of readdirSync(langDir)) {
        const cardDir = path.join(langDir, cardId);
        if (!statSync(cardDir).isDirectory()) continue;
        const move = planNarutoCardMove(set, lang, cardId);
        if (move) out.push(move);
      }
    }
  }
  return out;
}

function mergeDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (statSync(from).isDirectory()) {
      mergeDir(from, to);
      continue;
    }
    if (!existsSync(to)) {
      renameSync(from, to);
      continue;
    }
    unlinkSync(from);
  }
}

export function applyNarutoLayoutMoves(
  cardsDir: string,
  moves: readonly NarutoLayoutMove[],
): { moved: number; appearances: NarutoAppearancesFile } {
  const appearances: Record<string, NarutoLangAppearances> = {};
  let moved = 0;
  for (const move of moves) {
    const from = path.join(cardsDir, move.fromRel);
    const to = path.join(cardsDir, move.toRel);
    if (!existsSync(from)) continue;
    if (path.resolve(from) === path.resolve(to)) continue;
    mergeDir(from, to);
    moved += 1;
    removeEmptyDirTree(from);
    const langs = appearances[move.diskId] ?? {};
    langs[move.lang] = appearanceValueForJson(
      mergeAppearanceValues(langs[move.lang], move.appearanceSet),
    );
    appearances[move.diskId] = langs;
  }
  return {
    moved,
    appearances: {
      generatedAt: new Date().toISOString(),
      appearances,
    },
  };
}

function copyBackIfPresent(src: string, dest: string): boolean {
  if (!existsSync(src) || existsSync(dest)) return false;
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

/** One-shot FR/EN copy. IT/JA arrive via `curated/cards/back.{lang}.png`. */
export function installNarutoLanguageBacks(input: {
  carddassCardsDir: string;
  enCcgCardsDir: string | null;
}): { fr: boolean; en: boolean } {
  const dest = input.carddassCardsDir;
  const frSrc = ["back.webp", "back.png", "back.jpg"].map((n) =>
    path.join(dest, n),
  );
  const frHit = frSrc.find((p) => existsSync(p));
  const fr = frHit
    ? copyBackIfPresent(frHit, path.join(dest, "back.fr.webp")) ||
      existsSync(path.join(dest, "back.fr.webp"))
    : existsSync(path.join(dest, "back.fr.webp"));

  let en = existsSync(path.join(dest, "back.en.webp"));
  if (input.enCcgCardsDir) {
    const enSrc = ["back.webp", "back.png", "back.jpg"]
      .map((n) => path.join(input.enCcgCardsDir!, n))
      .find((p) => existsSync(p));
    if (enSrc) {
      en = copyBackIfPresent(enSrc, path.join(dest, "back.en.webp")) || en;
    }
    const setBack = path.join(input.enCcgCardsDir, "s28", "back.webp");
    if (existsSync(setBack)) {
      en = copyBackIfPresent(setBack, path.join(dest, "back.en.webp")) || en;
    }
  }
  return { fr: Boolean(fr), en };
}

function loadProductsIndex(file: string, pack: string): ProductsIndexV1 {
  if (!existsSync(file)) return emptyProductsIndex(pack);
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (isProductsIndexV1(raw)) return raw;
  } catch {
    /* ignore */
  }
  return emptyProductsIndex(pack);
}

function mergeEnCcgProducts(carddassRoot: string, enRoot: string): number {
  if (path.resolve(carddassRoot) === path.resolve(enRoot)) return 0;
  const srcProducts = path.join(enRoot, "products");
  const destProducts = path.join(carddassRoot, "products");
  if (existsSync(srcProducts)) mergeDir(srcProducts, destProducts);

  const destPath = path.join(carddassRoot, "products-index.json");
  const srcPath = path.join(enRoot, "products-index.json");
  if (!existsSync(srcPath)) return 0;
  const dest = loadProductsIndex(destPath, NARUTO_PACK_ID);
  const src = loadProductsIndex(srcPath, NARUTO_PACK_ID);
  const destSlugs = new Set(
    Object.values(dest.products).map((entry) => entry.slug.trim()),
  );
  let added = 0;
  for (const [key, entry] of Object.entries(src.products)) {
    if (dest.products[key]) continue;
    const slug = entry.slug.trim();
    /*
      Même SKU sous une ancienne clé `naruto/en-ccg::…` et `naruto/carddass::…` :
      un seul conseil d'achat, une seule clé React.
    */
    if (slug && destSlugs.has(slug)) continue;
    dest.products[key] = entry;
    if (slug) destSlugs.add(slug);
    added += 1;
  }
  if (added === 0 && existsSync(destPath)) return 0;
  dest.pack = NARUTO_PACK_ID;
  dest.generatedAt = new Date().toISOString();
  writeFileSync(destPath, `${JSON.stringify(dest)}\n`);
  return added;
}

export function upsertNarutoAppearances(
  root: string,
  rows: readonly { diskId: string; lang: string; appearanceSet: string }[],
): void {
  const existing = loadNarutoAppearancesFile(root);
  const appearances: Record<string, NarutoLangAppearances> = {
    ...(existing?.appearances ?? {}),
  };
  for (const row of rows) {
    const set = row.appearanceSet.trim().toLowerCase();
    const lang = row.lang.trim().toLowerCase();
    if (
      lang === "fr" &&
      /^s[1-6]$/.test(set) &&
      narutoCatalogueLineForCard(row.diskId, set) === "en-ccg"
    ) {
      continue;
    }
    const langs = appearances[row.diskId] ?? {};
    langs[row.lang] = appearanceValueForJson(
      mergeAppearanceValues(langs[row.lang], row.appearanceSet),
    );
    appearances[row.diskId] = langs;
  }
  writeNarutoAppearancesFile(root, {
    generatedAt: new Date().toISOString(),
    appearances,
  });
}

export function migrateNarutoCardLayout(opts?: {
  carddassRoot?: string;
  enCcgRoot?: string;
}): {
  carddassMoved: number;
  enMoved: number;
  appearancesPath: string;
  backs: { fr: boolean; en: boolean };
  productsMerged: number;
} {
  const carddassRoot = opts?.carddassRoot ?? physicalPackDir(NARUTO_PACK_ID);
  const enRoot =
    opts?.enCcgRoot ?? physicalPackDir(NARUTO_LEGACY_EN_CCG_DISK);
  const destCards = path.join(carddassRoot, "cards");
  const enCards = path.join(enRoot, "cards");

  const carddassMoves = planNarutoLayoutMovesFromTree(destCards);
  const carddass = applyNarutoLayoutMoves(destCards, carddassMoves);

  let enMoved = 0;
  const enAppearances: Record<string, NarutoLangAppearances> = {
    ...carddass.appearances.appearances,
  };
  if (
    existsSync(enCards) &&
    path.resolve(enRoot) !== path.resolve(carddassRoot)
  ) {
    const enMoves = planNarutoLayoutMovesFromTree(enCards);
    for (const move of enMoves) {
      const from = path.join(enCards, move.fromRel);
      const to = path.join(destCards, move.toRel);
      if (!existsSync(from)) continue;
      mergeDir(from, to);
      enMoved += 1;
      const langs = enAppearances[move.diskId] ?? {};
      langs[move.lang] = appearanceValueForJson(
        mergeAppearanceValues(langs[move.lang], move.appearanceSet),
      );
      enAppearances[move.diskId] = langs;
    }
  }

  const backs = installNarutoLanguageBacks({
    carddassCardsDir: destCards,
    enCcgCardsDir: existsSync(enCards) ? enCards : null,
  });

  removeEmptyLegacySeriesDirs(destCards);
  if (
    existsSync(enCards) &&
    path.resolve(enRoot) !== path.resolve(carddassRoot)
  ) {
    removeEmptyLegacySeriesDirs(enCards);
  }

  const productsMerged = mergeEnCcgProducts(carddassRoot, enRoot);

  const previous = loadNarutoAppearancesFile(carddassRoot)?.appearances ?? {};
  const mergedAppearances: Record<string, NarutoLangAppearances> = {
    ...previous,
  };
  for (const [diskId, langs] of Object.entries(enAppearances)) {
    const slot = { ...mergedAppearances[diskId] };
    for (const [lang, value] of Object.entries(langs)) {
      slot[lang] = appearanceValueForJson(
        mergeAppearanceValues(slot[lang], value),
      );
    }
    mergedAppearances[diskId] = slot;
  }
  const appearancesDoc = {
    generatedAt: new Date().toISOString(),
    appearances: remapNarutoAppearanceDiskIds(mergedAppearances),
  } satisfies NarutoAppearancesFile;
  writeNarutoAppearancesFile(carddassRoot, appearancesDoc);

  return {
    carddassMoved: carddass.moved,
    enMoved,
    appearancesPath: path.join(carddassRoot, "catalog.sqlite"),
    backs,
    productsMerged,
  };
}

// --- from fixThumbs.ts ---

/**
 * Detect and repair distorted card thumbnails.
 *
 * A thumbnail is a scaled copy of its card's face, so it must carry the same
 * aspect ratio as that face. Some early thumbs were resized without keeping
 * the ratio — `s2/fr/ta091/thumb.jpg` is 400x458 (0.873) while its own
 * `art.jpg` is 350x495 (0.707), a card squashed 24% flat.
 *
 * The reference is the card's own face, not a corpus average: sets legitimately
 * differ (350x495 in S1–S4, 843x1206 in S5), so only the per-card comparison is
 * meaningful.
 *
 *   Catalogue Sync --only thumbs
 *   Catalogue Sync --only thumbs --dry-run
 */




/** A thumb may drift this far from its face before we call it distorted. */
export const THUMB_RATIO_TOLERANCE = 0.02;

export type ThumbCheck = {
  cardId: string;
  set: string;
  dir: string;
  lang: string;
  thumb: { width: number; height: number; ratio: number };
  face: { width: number; height: number; ratio: number };
  deviation: number;
  distorted: boolean;
};

/** Relative gap between a thumb ratio and its face ratio. */
export function thumbRatioDeviation(
  thumbW: number,
  thumbH: number,
  faceW: number,
  faceH: number,
): number {
  if (!thumbH || !faceH || !faceW) return 0;
  const face = faceW / faceH;
  return Math.abs(thumbW / thumbH - face) / face;
}

/** Height is kept so the thumb stays in the same size family; width follows. */
export function correctedThumbSize(
  thumbH: number,
  faceW: number,
  faceH: number,
): { width: number; height: number } {
  return { width: Math.round(thumbH * (faceW / faceH)), height: thumbH };
}

function cardsDir(): string {
  return path.join(dataRoot(), NARUTO_PACK_ID, "cards");
}

export async function checkNarutoThumbs(): Promise<ThumbCheck[]> {
  const root = cardsDir();
  if (!existsSync(root)) return [];

  const out: ThumbCheck[] = [];
  for (const hit of listNarutoCardDirs(root)) {
    let files: string[];
    try {
      files = readdirSync(hit.abs);
    } catch {
      continue;
    }
    const thumb = files.find((f) => /^thumb\.(jpe?g|png|webp|gif)$/i.test(f));
    const face = pickPreferredFaceArtFilename(files, hit.lang);
    if (!thumb || !face) continue;

    const t = await sharp(path.join(hit.abs, thumb)).metadata();
    const f = await sharp(path.join(hit.abs, face)).metadata();
    const tw = t.width ?? 0;
    const th = t.height ?? 0;
    const fw = f.width ?? 0;
    const fh = f.height ?? 0;
    if (!tw || !th || !fw || !fh) continue;

    const deviation = thumbRatioDeviation(tw, th, fw, fh);
    out.push({
      cardId: hit.diskId,
      set: hit.appearanceSet ?? hit.family,
      dir: hit.abs,
      lang: hit.lang,
      thumb: { width: tw, height: th, ratio: tw / th },
      face: { width: fw, height: fh, ratio: fw / fh },
      deviation,
      distorted: deviation > THUMB_RATIO_TOLERANCE,
    });
  }
  return out;
}

export async function runNarutoFixThumbs(opts?: {
  dryRun?: boolean;
}): Promise<void> {
  console.log(`── Naruto thumbs${opts?.dryRun ? " (dry run)" : ""}`);
  const checks = await checkNarutoThumbs();
  const bad = checks
    .filter((c) => c.distorted)
    .sort((a, b) => b.deviation - a.deviation);

  console.log(`   ${checks.length} vignettes, ${bad.length} déformées`);
  for (const c of bad) {
    const size = correctedThumbSize(
      c.thumb.height,
      c.face.width,
      c.face.height,
    );
    const dir = c.dir;
    const files = readdirSync(dir);
    const thumb = files.find((f) => /^thumb\.(jpe?g|png|webp|gif)$/i.test(f))!;
    const face = pickPreferredFaceArtFilename(files, c.lang)!;

    console.log(
      `   ${c.set}/${c.cardId.padEnd(10)} ${c.thumb.width}x${c.thumb.height}` +
        ` (${(c.deviation * 100).toFixed(1)}% d'écart) → ${size.width}x${size.height}`,
    );
    if (opts?.dryRun) continue;

    // Re-derive from the face rather than un-stretching the thumb: the face
    // holds the undistorted pixels.
    const buf = await sharp(path.join(dir, face))
      .resize(size.width, size.height, { fit: "fill" })
      .jpeg({ quality: 90 })
      .toBuffer();
    await sharp(buf).toFile(path.join(dir, thumb));
  }
  if (!bad.length) console.log("   rien à corriger");
}
