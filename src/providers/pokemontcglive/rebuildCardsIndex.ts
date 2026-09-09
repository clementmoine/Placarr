/**
 * Rebuild `data/pokemon/cards-index.json` (CardsIndexV1) by walking on-disk
 * catalogue faces under `data/pokemon/cards/{set}/{lang}/{card}/`.
 *
 * Keys are Live-style bundle stems (`me5_fr_045`). Names come from
 * `catalog.sqlite` (`live_cards`) via shared `attachTitlesToCardsIndex`, then
 * sibling-locale fill for any remaining empty slots.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { CardsIndexLangFiles, CardsIndexV1 } from "@/effects/cardsIndex";
import { packCardsDir, packCardsIndexPath } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";
import {
  attachSiblingTitlesToCardsIndex,
  attachTitlesToCardsIndex,
  type ResolvedIndexTitle,
} from "@/providers/shared/cardCatalogue/attachIndexTitles";
import { resolvePokemonArtFilename } from "@/providers/tcgdex/faceChoice";

const BUNDLE_RE = /^([a-z0-9.-]+)_([a-z]{2,4})_(\d{3})(?:_[a-z]+)?$/i;

export type RebuildPokemonCardsIndexResult = {
  path: string;
  cards: number;
  named: number;
  skipped: boolean;
};

type LiveNameRow = {
  bundleStem: string;
  liveSet: string;
  num: number;
  lang: string;
  nameEn: string | null;
  /** Localized title for `lang` (column historically named name_fr). */
  nameLocalized: string | null;
};

type LiveNameLookup = {
  byStem: Map<string, LiveNameRow>;
  bySetNum: Map<string, LiveNameRow[]>;
};

function repoFromDataRoot(): string {
  return path.resolve(dataRoot(), "..");
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).filter((name) => {
    try {
      return statSync(path.join(dir, name)).isFile();
    } catch {
      return false;
    }
  });
}

function langFilesFromDir(
  cardDir: string,
  lang: string,
): CardsIndexLangFiles {
  const langFiles: CardsIndexLangFiles = {};
  const variants: NonNullable<CardsIndexLangFiles["variants"]> = {};

  const artWinner = resolvePokemonArtFilename(cardDir, lang);
  if (artWinner) langFiles.art = artWinner;

  for (const file of listFiles(cardDir)) {
    const low = file.toLowerCase();
    if (low.startsWith("art.")) {
      if (!langFiles.art) langFiles.art = file;
    } else if (low === "mask.webp" || low === "mask.png") langFiles.mask = file;
    else if (low.startsWith("mask-ph.")) {
      variants.ph = { ...(variants.ph ?? {}), mask: file };
    } else if (low.startsWith("mask-mph.")) {
      variants.mph = { ...(variants.mph ?? {}), mask: file };
    } else if (low.startsWith("mask-sph.")) {
      variants.sph = { ...(variants.sph ?? {}), mask: file };
    } else if (low.startsWith("etch.")) langFiles.etch = file;
    else if (low.startsWith("back.")) langFiles.back = file;
    else if (low.startsWith("thumb.")) langFiles.thumb = file;
  }

  if (Object.keys(variants).length) langFiles.variants = variants;
  return langFiles;
}

function setNumKey(liveSet: string, num: number): string {
  return `${liveSet.toLowerCase()}\0${num}`;
}

/** Read identity titles from catalog.sqlite (soft-empty when missing). */
export function loadPokemonLiveNameLookup(dbPath: string): LiveNameLookup {
  const byStem = new Map<string, LiveNameRow>();
  const bySetNum = new Map<string, LiveNameRow[]>();
  if (!existsSync(dbPath)) return { byStem, bySetNum };

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const has = db
      .prepare(
        `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='live_cards'`,
      )
      .get() as { ok?: number } | undefined;
    if (!has?.ok) return { byStem, bySetNum };

    const rows = db
      .prepare(
        `SELECT bundle_stem AS bundleStem, live_set AS liveSet, num, lang,
                name_en AS nameEn, name_fr AS nameLocalized
         FROM live_cards`,
      )
      .all() as LiveNameRow[];

    for (const row of rows) {
      const stem = String(row.bundleStem ?? "")
        .trim()
        .toLowerCase();
      if (!stem) continue;
      const liveSet = String(row.liveSet ?? "")
        .trim()
        .toLowerCase();
      const num = Number(row.num);
      const lang = String(row.lang ?? "")
        .trim()
        .toLowerCase();
      const nameEn = row.nameEn?.trim() || null;
      const nameLocalized = row.nameLocalized?.trim() || null;
      if (!nameEn && !nameLocalized) continue;

      const normalized: LiveNameRow = {
        bundleStem: stem,
        liveSet,
        num,
        lang,
        nameEn,
        nameLocalized,
      };
      byStem.set(stem, normalized);
      if (liveSet && Number.isFinite(num)) {
        const key = setNumKey(liveSet, num);
        const list = bySetNum.get(key) ?? [];
        list.push(normalized);
        bySetNum.set(key, list);
      }
    }
  } finally {
    db.close();
  }
  return { byStem, bySetNum };
}

function titleForLang(row: LiveNameRow, wantLang: string): string | null {
  if (wantLang === "en") return row.nameEn || row.nameLocalized;
  if (row.lang === wantLang) return row.nameLocalized || row.nameEn;
  return null;
}

/**
 * Resolve a catalogue tile title for `stem` (`set_lang_num`).
 * Prefer the live row for that exact stem; else same set+num (locale title,
 * then English as a showable fallback).
 */
export function resolvePokemonIndexName(
  stem: string,
  lookup: LiveNameLookup,
): ResolvedIndexTitle | null {
  const m = BUNDLE_RE.exec(stem.trim());
  if (!m) return null;
  const liveSet = m[1]!.toLowerCase();
  const lang = m[2]!.toLowerCase();
  const num = Number.parseInt(m[3]!, 10);

  const direct = lookup.byStem.get(stem.trim().toLowerCase());
  if (direct) {
    const localized = titleForLang(direct, lang);
    if (localized) return { kind: "attested", name: localized };
    if (direct.nameEn) {
      return {
        kind: "fallback",
        name: direct.nameEn,
        catalogue: "show",
        from: "en",
      };
    }
    if (direct.nameLocalized) {
      return direct.lang === lang
        ? { kind: "attested", name: direct.nameLocalized }
        : {
            kind: "fallback",
            name: direct.nameLocalized,
            catalogue: "show",
            from: direct.lang,
          };
    }
  }

  const cands = lookup.bySetNum.get(setNumKey(liveSet, num)) ?? [];
  for (const row of cands) {
    const localized = titleForLang(row, lang);
    if (localized) return { kind: "attested", name: localized };
  }
  for (const row of cands) {
    if (row.nameEn) {
      return {
        kind: "fallback",
        name: row.nameEn,
        catalogue: "show",
        from: "en",
      };
    }
  }
  for (const row of cands) {
    if (row.nameLocalized) {
      return {
        kind: "fallback",
        name: row.nameLocalized,
        catalogue: "show",
        from: row.lang,
      };
    }
  }
  return null;
}

/** Walk `data/pokemon/cards` → write `cards-index.json`. Soft no-op if empty. */
export function rebuildPokemonCardsIndex(opts?: {
  root?: string;
}): RebuildPokemonCardsIndexResult {
  const root = opts?.root ?? repoFromDataRoot();
  const cardsDir = packCardsDir("pokemon");
  const cardsRoot = opts?.root
    ? path.join(root, "data", "pokemon", "cards")
    : cardsDir;
  const out = opts?.root
    ? path.join(root, "data", "pokemon", "cards-index.json")
    : packCardsIndexPath("pokemon");
  const catalogDb = opts?.root
    ? path.join(root, "data", "pokemon", "catalog.sqlite")
    : path.join(dataRoot(), "pokemon", "catalog.sqlite");

  const index: CardsIndexV1 = {
    version: 1,
    pack: "pokemon",
    generatedAt: new Date().toISOString(),
    cards: {},
  };

  if (!existsSync(cardsRoot) || !statSync(cardsRoot).isDirectory()) {
    return { path: out, cards: 0, named: 0, skipped: true };
  }

  for (const set of readdirSync(cardsRoot)) {
    const setDir = path.join(cardsRoot, set);
    if (!statSync(setDir).isDirectory()) continue;
    if (set.startsWith("back.")) continue;

    for (const lang of readdirSync(setDir)) {
      const langDir = path.join(setDir, lang);
      if (!statSync(langDir).isDirectory()) continue;

      for (const card of readdirSync(langDir)) {
        const cardDir = path.join(langDir, card);
        if (!statSync(cardDir).isDirectory()) continue;
        const stem = `${set}_${lang}_${card}`;
        if (!BUNDLE_RE.test(stem)) continue;

        const langFiles = langFilesFromDir(cardDir, lang);
        if (!langFiles.art && !langFiles.mask && !langFiles.thumb) continue;

        index.cards[stem] = {
          set,
          card,
          langs: { [lang]: langFiles },
        };
      }
    }
  }

  const names = loadPokemonLiveNameLookup(catalogDb);
  attachTitlesToCardsIndex(index, (printKey) =>
    resolvePokemonIndexName(printKey, names),
  );
  attachSiblingTitlesToCardsIndex(index);

  let named = 0;
  for (const entry of Object.values(index.cards)) {
    for (const files of Object.values(entry.langs)) {
      if (files.name?.trim() && !files.nameLocaleFrom?.trim()) named += 1;
    }
  }

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(index)}\n`, "utf8");
  return {
    path: out,
    cards: Object.keys(index.cards).length,
    named,
    skipped: false,
  };
}
