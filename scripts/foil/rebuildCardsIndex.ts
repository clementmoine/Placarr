#!/usr/bin/env npx tsx
/**
 * Rebuild `data/<pack>/cards-index.json` (v1) after layout migration.
 */
import fs from "node:fs";
import path from "node:path";

import { parsePrintKey } from "../src/core/identify/printKey";
import type { CardsIndexV1 } from "../src/effects/cardsIndex";
import {
  packCardsDir,
  packCardsIndexPath,
  repoRoot,
} from "../scripts/lib/foilPaths";

const BUNDLE_RE =
  /^([a-z0-9.-]+)_([a-z]{2,4})_(\d{3})(?:_[a-z]+)?$/i;

function rebuildLorcana(repo: string): void {
  const cardsDir = packCardsDir(repo, "lorcana");
  const index: CardsIndexV1 = {
    version: 1,
    pack: "lorcana",
    generatedAt: new Date().toISOString(),
    cards: {},
  };

  // Prefer catalog.sqlite export when available
  const dbPath = path.join(repo, "data/lorcana/catalog.sqlite");
  if (fs.existsSync(dbPath)) {
    // Dynamic require avoided — walk disk for filenames, keys from print dirs via parse
  }

  if (!fs.existsSync(cardsDir)) {
    console.warn("no lorcana cards dir");
    return;
  }

  for (const set of fs.readdirSync(cardsDir)) {
    const setDir = path.join(cardsDir, set);
    if (!fs.statSync(setDir).isDirectory() || set === "back.webp") continue;
    if (set.startsWith("back.")) continue;
    for (const lang of fs.readdirSync(setDir)) {
      const langDir = path.join(setDir, lang);
      if (!fs.statSync(langDir).isDirectory()) continue;
      for (const card of fs.readdirSync(langDir)) {
        const cardDir = path.join(langDir, card);
        if (!fs.statSync(cardDir).isDirectory()) continue;
        const files = fs.readdirSync(cardDir).filter((f) =>
          fs.statSync(path.join(cardDir, f)).isFile(),
        );
        const langFiles: Record<string, string> = {};
        for (const f of files) {
          const stem = f.replace(/\.[^.]+$/, "").toLowerCase();
          if (stem === "art") langFiles.art = f;
          else if (stem === "thumb") langFiles.thumb = f;
          else if (stem === "mask" || stem.startsWith("mask")) langFiles.mask = f;
          else if (stem.startsWith("varnish") && stem.includes("second")) {
            langFiles.secondVarnishMask = f;
          } else if (stem.startsWith("varnish")) langFiles.varnishMask = f;
          else if (stem === "back") langFiles.back = f;
        }
        // Rebuild printKey
        const parts = card.split("-");
        const number = parts[0]!;
        const grouping = parts.length > 1 ? parts.slice(1).join("-") : null;
        const printKey = grouping
          ? `lorcana:${set}-${number}-${grouping}`
          : `lorcana:${set}-${number}`;
        if (!parsePrintKey(printKey)) {
          console.warn("skip bad printKey", printKey);
          continue;
        }
        const entry = index.cards[printKey] ?? {
          set,
          card,
          langs: {},
        };
        entry.langs[lang] = langFiles;
        index.cards[printKey] = entry;
      }
    }
  }

  const out = packCardsIndexPath(repo, "lorcana");
  fs.writeFileSync(out, `${JSON.stringify(index)}\n`);
  console.log(`lorcana cards-index: ${Object.keys(index.cards).length} prints → ${out}`);
}

function rebuildPokemon(repo: string): void {
  const cardsDir = packCardsDir(repo, "pokemon");
  const index: CardsIndexV1 = {
    version: 1,
    pack: "pokemon",
    generatedAt: new Date().toISOString(),
    cards: {},
  };
  if (!fs.existsSync(cardsDir)) {
    console.warn("no pokemon cards dir yet");
    return;
  }
  for (const set of fs.readdirSync(cardsDir)) {
    const setDir = path.join(cardsDir, set);
    if (!fs.statSync(setDir).isDirectory()) continue;
    if (set.startsWith("back.")) continue;
    for (const lang of fs.readdirSync(setDir)) {
      const langDir = path.join(setDir, lang);
      if (!fs.statSync(langDir).isDirectory()) continue;
      for (const card of fs.readdirSync(langDir)) {
        const cardDir = path.join(langDir, card);
        if (!fs.statSync(cardDir).isDirectory()) continue;
        const stem = `${set}_${lang}_${card}`;
        if (!BUNDLE_RE.test(stem)) continue;
        const files = fs.readdirSync(cardDir).filter((f) =>
          fs.statSync(path.join(cardDir, f)).isFile(),
        );
        const langFiles: Record<string, string> = {};
        const variants: Record<string, { mask?: string; etch?: string }> = {};
        for (const f of files) {
          const low = f.toLowerCase();
          if (low.startsWith("art.")) langFiles.art = f;
          else if (low === "mask.webp" || low === "mask.png") langFiles.mask = f;
          else if (low.startsWith("mask-ph.")) {
            variants.ph = { ...(variants.ph ?? {}), mask: f };
          } else if (low.startsWith("mask-mph.")) {
            variants.mph = { ...(variants.mph ?? {}), mask: f };
          } else if (low.startsWith("mask-sph.")) {
            variants.sph = { ...(variants.sph ?? {}), mask: f };
          } else if (low.startsWith("etch.")) langFiles.etch = f;
          else if (low.startsWith("back.")) langFiles.back = f;
        }
        if (Object.keys(variants).length) langFiles.variants = variants as never;
        index.cards[stem] = {
          set,
          card,
          langs: { [lang]: langFiles },
        };
      }
    }
  }
  const out = packCardsIndexPath(repo, "pokemon");
  fs.writeFileSync(out, `${JSON.stringify(index)}\n`);
  console.log(`pokemon cards-index: ${Object.keys(index.cards).length} stems → ${out}`);
}

const repo = repoRoot();
rebuildLorcana(repo);
rebuildPokemon(repo);
