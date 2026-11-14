/**
 * One-shot cutover: `cards/{set}/{lang}/{card}` (+ Carddass family tree)
 * → `cards/{lang}/{set}/{card}`. No dual-read after this runs.
 *
 *   pnpm exec tsx scripts/migrateCardsLangFirst.ts
 *   pnpm exec tsx scripts/migrateCardsLangFirst.ts --dry-run
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  copyFileSync,
} from "node:fs";
import path from "node:path";

import "dotenv/config";

import { dataRoot } from "@/lib/runtimeData";
import {
  isNarutoFamilyFolder,
  loadNarutoAppearancesFile,
  primaryAppearanceSet,
  appearanceSetsOf,
} from "@/providers/naruto/narutocarddass/identity";

const DRY = process.argv.some((a) => a === "--dry-run" || a === "-n");
const LANGS = new Set(["fr", "en", "it", "ja", "de", "es", "pt", "ko", "zh"]);

type Move = { from: string; to: string };

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function dirs(p: string): string[] {
  if (!existsSync(p)) return [];
  return readdirSync(p).filter(
    (name) => !name.startsWith(".") && isDir(path.join(p, name)),
  );
}

function ensureParent(file: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
}

function planMove(from: string, to: string, out: Move[]): void {
  if (path.resolve(from) === path.resolve(to)) return;
  if (!existsSync(from)) return;
  out.push({ from, to });
}

function applyMoves(moves: Move[]): void {
  for (const { from, to } of moves) {
    if (DRY) {
      console.log(`  MOVE ${path.relative(dataRoot(), from)} → ${path.relative(dataRoot(), to)}`);
      continue;
    }
    ensureParent(to);
    if (existsSync(to)) {
      // Merge: move files that are missing at dest, then drop empty src.
      if (isDir(from) && isDir(to)) {
        for (const name of readdirSync(from)) {
          const src = path.join(from, name);
          const dest = path.join(to, name);
          if (!existsSync(dest)) {
            ensureParent(dest);
            renameSync(src, dest);
          }
        }
        rmSync(from, { recursive: true, force: true });
      }
      continue;
    }
    renameSync(from, to);
  }
}

/** Standard TCG: cards/{set}/{lang}/{card} → cards/{lang}/{set}/{card} */
function migrateSetLangCard(cardsDir: string): Move[] {
  const moves: Move[] = [];
  for (const set of dirs(cardsDir)) {
    if (LANGS.has(set.toLowerCase())) continue;
    if (isNarutoFamilyFolder(set) && set !== "promo") continue;
    const setDir = path.join(cardsDir, set);
    for (const lang of dirs(setDir)) {
      if (!LANGS.has(lang.toLowerCase())) continue;
      const langDir = path.join(setDir, lang);
      for (const card of dirs(langDir)) {
        planMove(
          path.join(langDir, card),
          path.join(cardsDir, lang, set, card),
          moves,
        );
      }
    }
  }
  return moves;
}

/** cards/{set}/back.* → cards/{lang}/{set}/back.* for every lang that has that set. */
function migrateSetBacks(cardsDir: string): void {
  for (const set of dirs(cardsDir)) {
    if (LANGS.has(set.toLowerCase())) continue;
    if (isNarutoFamilyFolder(set) && set !== "promo") continue;
    const setDir = path.join(cardsDir, set);
    const setLangs = dirs(setDir).filter((l) => LANGS.has(l.toLowerCase()));
    // After card moves, langs may already live under cards/{lang}/{set}
    const langs = new Set(setLangs);
    for (const lang of dirs(cardsDir)) {
      if (!LANGS.has(lang.toLowerCase())) continue;
      if (isDir(path.join(cardsDir, lang, set))) langs.add(lang);
    }
    if (langs.size === 0) langs.add("fr");
    for (const name of readdirSync(setDir)) {
      if (!/^back\./i.test(name)) continue;
      const src = path.join(setDir, name);
      if (isDir(src)) continue;
      for (const lang of langs) {
        const dest = path.join(cardsDir, lang, set, name);
        if (DRY) {
          console.log(
            `  BACK ${path.relative(dataRoot(), src)} → ${path.relative(dataRoot(), dest)}`,
          );
          continue;
        }
        ensureParent(dest);
        if (!existsSync(dest)) copyFileSync(src, dest);
      }
      if (!DRY) rmSync(src, { force: true });
    }
  }
}

/**
 * Carddass family tree: cards/{family}/{diskId}/{lang}
 * → cards/{lang}/{primarySet}/{diskId}
 */
function migrateFamilyTree(cardsDir: string): Move[] {
  const packRoot = path.dirname(cardsDir);
  const appearances =
    loadNarutoAppearancesFile(packRoot)?.appearances ?? {};
  const moves: Move[] = [];
  for (const family of dirs(cardsDir)) {
    if (!isNarutoFamilyFolder(family)) continue;
    // promo may also appear as set-first legacy; family promo is {promo}/{id}/{lang}
    const familyDir = path.join(cardsDir, family);
    for (const diskId of dirs(familyDir)) {
      if (LANGS.has(diskId.toLowerCase())) continue;
      const diskDir = path.join(familyDir, diskId);
      for (const lang of dirs(diskDir)) {
        if (!LANGS.has(lang.toLowerCase())) continue;
        const sets = appearanceSetsOf(appearances[diskId]?.[lang]);
        const primary =
          (sets.length ? primaryAppearanceSet(sets) : null) ??
          (family === "promo" ? "promo" : "s1");
        planMove(
          path.join(diskDir, lang),
          path.join(cardsDir, lang, primary, diskId),
          moves,
        );
      }
    }
  }
  return moves;
}

function looksLangFirst(cardsDir: string): boolean {
  const top = dirs(cardsDir);
  const langTops = top.filter((d) => LANGS.has(d.toLowerCase()));
  if (langTops.length === 0) return false;
  // At least one lang/{set}/{card} triple
  for (const lang of langTops) {
    for (const set of dirs(path.join(cardsDir, lang))) {
      if (dirs(path.join(cardsDir, lang, set)).length > 0) return true;
    }
  }
  return false;
}

function looksFamilyTree(cardsDir: string): boolean {
  return dirs(cardsDir).some(
    (d) => isNarutoFamilyFolder(d) && d !== "promo",
  );
}

function findCardsDirs(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4) return;
    for (const name of dirs(dir)) {
      const abs = path.join(dir, name);
      if (name === "cards") {
        out.push(abs);
        continue;
      }
      if (name === "staging" || name === "foil" || name === "node_modules") {
        continue;
      }
      walk(abs, depth + 1);
    }
  };
  walk(root, 0);
  return out;
}

function pruneEmpty(dir: string): void {
  if (!existsSync(dir) || !isDir(dir)) return;
  for (const name of dirs(dir)) pruneEmpty(path.join(dir, name));
  // Drop AppleDouble / empty shells left after lang moves.
  if (!DRY) {
    for (const name of readdirSync(dir)) {
      if (name === ".DS_Store" || name.startsWith("._")) {
        rmSync(path.join(dir, name), { force: true });
      }
    }
  }
  if (dirs(dir).length === 0 && readdirSync(dir).length === 0) {
    if (!DRY) rmSync(dir, { recursive: true, force: true });
  }
}

function main(): void {
  const root = dataRoot();
  console.log(`data root: ${root}${DRY ? " (dry-run)" : ""}`);
  const cardsDirs = findCardsDirs(root);
  let total = 0;
  for (const cardsDir of cardsDirs) {
    const rel = path.relative(root, cardsDir);
    const moves: Move[] = [];
    if (looksFamilyTree(cardsDir)) {
      console.log(`── ${rel} (family → lang/set/card)`);
      moves.push(...migrateFamilyTree(cardsDir));
    }
    // Also handle residual set/lang/card (legacy Carddass + every other pack)
    const setLangMoves = migrateSetLangCard(cardsDir);
    if (setLangMoves.length) {
      console.log(`── ${rel} (set/lang → lang/set)`);
      moves.push(...setLangMoves);
    }
    if (moves.length) {
      applyMoves(moves);
      total += moves.length;
      migrateSetBacks(cardsDir);
    } else if (looksLangFirst(cardsDir)) {
      console.log(`── ${rel} already lang-first`);
    }
    // Always drop empty family / set shells (.DS_Store residue).
    if (!DRY) pruneEmpty(cardsDir);
  }
  console.log(`Done: ${total} moves${DRY ? " planned" : ""}.`);
  if (!DRY) {
    console.log(
      "Rebuild catalogues (extract / rebuildNarutoIndex) so sqlite art paths match disk.",
    );
  }
}

main();
