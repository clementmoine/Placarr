/**
 * Absolute card folders. New tree: `{family}/{ni0001}/{lang}`.
 * Legacy `{s1}/{lang}/{ni001}` is still listed so thumbs / reconstruct dual-read.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

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
  appearances: Record<string, Record<string, string>> = {},
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
        out.push({
          abs: path.join(diskDir, lang),
          family,
          diskId,
          lang: code,
          appearanceSet: appearances[diskId]?.[code] ?? null,
        });
      }
    }
  }
  for (const set of dirs(cardsDir)) {
    if (isNarutoFamilyFolder(set) && set !== "promo") continue;
    const setDir = path.join(cardsDir, set);
    for (const lang of dirs(setDir)) {
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
