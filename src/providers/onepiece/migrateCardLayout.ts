/**
 * Relocate One Piece faces from legacy `cards/{set}/{lang}/{card}/` onto the
 * universal `cards/{lang}/{set}/{card}/` contract (`packCardDir`).
 *
 * Bandai + DON installs wrote set-first for a while; admin catalogue only
 * probes lang-first → honest « sans image » while bytes sat next door.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";

import { packCardsDir } from "@/lib/packPaths";

import { ONEPIECE_PACK_ID } from "./pack";

const FACE_LANGS = new Set(["en", "fr", "ja"]);

export type MigrateOnepieceCardLayoutResult = {
  moved: number;
  skippedExisting: number;
  emptyDirsRemoved: number;
};

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listNames(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function dirEmpty(dir: string): boolean {
  return listNames(dir).length === 0;
}

/**
 * Move every legacy `set/lang/card` tree under the pack cards root.
 * When the canonical destination already has files, leave the legacy copy
 * (no clobber) and count it as skipped.
 */
export function migrateOnepieceCardLayout(
  cardsRoot = packCardsDir(ONEPIECE_PACK_ID),
): MigrateOnepieceCardLayoutResult {
  let moved = 0;
  let skippedExisting = 0;
  let emptyDirsRemoved = 0;

  for (const set of listNames(cardsRoot)) {
    if (FACE_LANGS.has(set.toLowerCase())) continue;
    const setDir = path.join(cardsRoot, set);
    if (!isDir(setDir)) continue;

    for (const lang of listNames(setDir)) {
      if (!FACE_LANGS.has(lang.toLowerCase())) continue;
      const langDir = path.join(setDir, lang);
      if (!isDir(langDir)) continue;

      for (const card of listNames(langDir)) {
        const src = path.join(langDir, card);
        if (!isDir(src)) continue;
        // Same shape as packCardDir — relative to `cardsRoot` for tests.
        const dest = path.join(cardsRoot, lang.toLowerCase(), set, card);
        if (existsSync(dest) && listNames(dest).length > 0) {
          skippedExisting += 1;
          continue;
        }
        mkdirSync(path.dirname(dest), { recursive: true });
        renameSync(src, dest);
        moved += 1;
      }

      if (dirEmpty(langDir)) {
        rmSync(langDir, { recursive: true, force: true });
        emptyDirsRemoved += 1;
      }
    }

    if (dirEmpty(setDir)) {
      rmSync(setDir, { recursive: true, force: true });
      emptyDirsRemoved += 1;
    }
  }

  return { moved, skippedExisting, emptyDirsRemoved };
}
