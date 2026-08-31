/**
 * Plan moves from `cards/{s1}/{fr}/{ni001}` → `cards/ninja/ni0001/fr`.
 * Language versos now live in `curated/cards/back.{lang}.png`. Storm 3 FR
 * stays `n1650`, never `ni1650`.
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

import { dataRoot } from "@/lib/runtimeData";
import {
  emptyProductsIndex,
  isProductsIndexV1,
  type ProductsIndexV1,
} from "@/providers/shared/sealedProducts/indexFormat";

import {
  isNarutoFamilyFolder,
  narutoCardDiskFolder,
  narutoDiskCardId,
  parseNarutoCollector,
} from "./collectorIdentity";
import {
  isNarutoLangDir,
  narutoCardRelPath,
  normalizeNarutoLang,
} from "./narutoCardPath";
import { NARUTO_EN_PACK_ID, NARUTO_PACK_ID } from "./packs";

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

import type { NarutoAppearanceValue, NarutoLangAppearances } from "./appearanceSets";
import {
  appearanceValueForJson,
  mergeAppearanceValues,
} from "./appearanceSets";

export type NarutoAppearancesFile = {
  generatedAt: string;
  appearances: Record<string, NarutoLangAppearances>;
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
  const src = loadProductsIndex(srcPath, NARUTO_EN_PACK_ID);
  const destSlugs = new Set(
    Object.values(dest.products).map((entry) => entry.slug.trim()),
  );
  let added = 0;
  for (const [key, entry] of Object.entries(src.products)) {
    if (dest.products[key]) continue;
    const slug = entry.slug.trim();
    /*
      Même SKU sous `naruto/en-ccg::display-s24` et `naruto/carddass::…` :
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
  const file = path.join(root, "appearances.json");
  let appearances: Record<string, NarutoLangAppearances> = {};
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(
        readFileSync(file, "utf8"),
      ) as NarutoAppearancesFile;
      appearances = raw.appearances ?? {};
    } catch {
      /* rebuild */
    }
  }
  for (const row of rows) {
    const langs = appearances[row.diskId] ?? {};
    langs[row.lang] = appearanceValueForJson(
      mergeAppearanceValues(langs[row.lang], row.appearanceSet),
    );
    appearances[row.diskId] = langs;
  }
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        appearances,
      } satisfies NarutoAppearancesFile,
      null,
      2,
    )}\n`,
  );
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
  const enRoot = opts?.enCcgRoot ?? physicalPackDir(NARUTO_EN_PACK_ID);
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

  const appearancesPath = path.join(carddassRoot, "appearances.json");
  let previous: Record<string, NarutoLangAppearances> = {};
  if (existsSync(appearancesPath)) {
    try {
      previous =
        (
          JSON.parse(
            readFileSync(appearancesPath, "utf8"),
          ) as NarutoAppearancesFile
        ).appearances ?? {};
    } catch {
      previous = {};
    }
  }
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
  writeFileSync(
    appearancesPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        appearances: remapNarutoAppearanceDiskIds(mergedAppearances),
      } satisfies NarutoAppearancesFile,
      null,
      2,
    )}\n`,
  );

  return {
    carddassMoved: carddass.moved,
    enMoved,
    appearancesPath,
    backs,
    productsMerged,
  };
}
