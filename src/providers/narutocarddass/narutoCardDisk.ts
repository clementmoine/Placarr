/**
 * Absolute card folders. New tree: `{family}/{ni0001}/{lang}`.
 * Legacy `{s1}/{lang}/{ni001}` is still listed so thumbs / reconstruct dual-read.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  appearanceSetsOf,
  primaryAppearanceSet,
  type NarutoLangAppearances,
} from "./appearanceSets";
import {
  isNarutoFamilyFolder,
  narutoDiskCardId,
  parseNarutoCollector,
} from "./collectorIdentity";
import {
  isNarutoLangDir,
  narutoCardPathFromCollector,
  narutoCardRelPath,
  normalizeNarutoLang,
} from "./narutoCardPath";

export function narutoCardAbsDir(
  cardsDir: string,
  cardId: string,
  lang: string,
  appearanceSet?: string | null,
): string | null {
  const id = narutoCardPathFromCollector(cardId, lang, appearanceSet);
  if (!id) return null;
  return path.join(cardsDir, narutoCardRelPath(id));
}

export type NarutoOnDiskCard = {
  abs: string;
  family: string;
  diskId: string;
  lang: string;
  appearanceSet: string | null;
};

function dirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => {
    if (name.startsWith(".")) return false;
    try {
      return statSync(path.join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

export function listNarutoCardDirs(
  cardsDir: string,
  appearances: Record<string, NarutoLangAppearances> = {},
): NarutoOnDiskCard[] {
  if (!existsSync(cardsDir)) return [];
  const out: NarutoOnDiskCard[] = [];
  for (const family of dirs(cardsDir)) {
    if (!isNarutoFamilyFolder(family)) continue;
    const familyDir = path.join(cardsDir, family);
    for (const diskId of dirs(familyDir)) {
      if (family === "promo" && isNarutoLangDir(diskId)) continue;
      const diskDir = path.join(familyDir, diskId);
      for (const lang of dirs(diskDir)) {
        const code = normalizeNarutoLang(lang);
        const sets = appearanceSetsOf(appearances[diskId]?.[code]);
        out.push({
          abs: path.join(diskDir, lang),
          family,
          diskId,
          lang: code,
          appearanceSet: sets.length ? primaryAppearanceSet(sets) : null,
        });
      }
    }
  }
  for (const set of dirs(cardsDir)) {
    if (isNarutoFamilyFolder(set) && set !== "promo") continue;
    const setDir = path.join(cardsDir, set);
    for (const lang of dirs(setDir)) {
      /*
        New family tree is `{promo}/{pr0096}/{fr}`. Without this guard the
        legacy walker treats `pr0096` as a language and `fr` as a card id —
        installing the same PNG to `cards/ninja/fr/pr0096/`.
      */
      if (!isNarutoLangDir(lang)) continue;
      const langDir = path.join(setDir, lang);
      for (const cardId of dirs(langDir)) {
        const parsed = parseNarutoCollector(cardId);
        const diskId = narutoDiskCardId(cardId, set) ?? cardId;
        out.push({
          abs: path.join(langDir, cardId),
          family: parsed?.family ?? "ninja",
          diskId,
          lang: normalizeNarutoLang(lang),
          appearanceSet: set.toLowerCase(),
        });
      }
    }
  }
  return out;
}
