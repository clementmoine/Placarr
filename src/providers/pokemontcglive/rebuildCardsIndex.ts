/**
 * Rebuild `data/pokemon/cards-index.json` (CardsIndexV1) by walking on-disk
 * catalogue faces under `data/pokemon/cards/{set}/{lang}/{card}/`.
 *
 * Keys are Live-style bundle stems (`me5_fr_045`). Distinct from
 * `catalog.sqlite` (identity join) — Catalogue UI reads this JSON.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import type { CardsIndexLangFiles, CardsIndexV1 } from "@/effects/cardsIndex";
import { packCardsDir, packCardsIndexPath } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";

const BUNDLE_RE = /^([a-z0-9.-]+)_([a-z]{2,4})_(\d{3})(?:_[a-z]+)?$/i;

export type RebuildPokemonCardsIndexResult = {
  path: string;
  cards: number;
  skipped: boolean;
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

function langFilesFromDir(cardDir: string): CardsIndexLangFiles {
  const langFiles: CardsIndexLangFiles = {};
  const variants: NonNullable<CardsIndexLangFiles["variants"]> = {};

  for (const file of listFiles(cardDir)) {
    const low = file.toLowerCase();
    if (low.startsWith("art.")) langFiles.art = file;
    else if (low === "mask.webp" || low === "mask.png") langFiles.mask = file;
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

/** Walk `data/pokemon/cards` → write `cards-index.json`. Soft no-op if empty. */
export function rebuildPokemonCardsIndex(opts?: {
  root?: string;
}): RebuildPokemonCardsIndexResult {
  const root = opts?.root ?? repoFromDataRoot();
  const cardsDir = packCardsDir("pokemon");
  // packCardsDir uses dataRoot(); when tests pass root, prefer explicit join
  const cardsRoot = opts?.root
    ? path.join(root, "data", "pokemon", "cards")
    : cardsDir;
  const out = opts?.root
    ? path.join(root, "data", "pokemon", "cards-index.json")
    : packCardsIndexPath("pokemon");

  const index: CardsIndexV1 = {
    version: 1,
    pack: "pokemon",
    generatedAt: new Date().toISOString(),
    cards: {},
  };

  if (!existsSync(cardsRoot) || !statSync(cardsRoot).isDirectory()) {
    return { path: out, cards: 0, skipped: true };
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

        const langFiles = langFilesFromDir(cardDir);
        if (!langFiles.art && !langFiles.mask && !langFiles.thumb) continue;

        index.cards[stem] = {
          set,
          card,
          langs: { [lang]: langFiles },
        };
      }
    }
  }

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(index)}\n`, "utf8");
  return {
    path: out,
    cards: Object.keys(index.cards).length,
    skipped: false,
  };
}
