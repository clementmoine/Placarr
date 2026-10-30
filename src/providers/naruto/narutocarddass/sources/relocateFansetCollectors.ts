/**
 * Drive fanset collectors (C/N/M/J 5000+) often landed under `en/s1/` when the
 * hub was first unpacked. Catalogue identity is set `fanset` + `printed: false`
 * — move folders so resolve and browse share one path.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
} from "node:fs";
import path from "node:path";

import { packCardsDir } from "@/lib/packPaths";

import { isNarutoLangDir } from "../disk";
import { NARUTO_PACK_ID, narutoDiskCardId } from "../identity";
import { isNarutoFansetCollector } from "../parse/catalogues";

const FANSET_SET = "fanset";

export function relocateFansetCollectors(
  cardsRoot = packCardsDir(NARUTO_PACK_ID),
): { moved: string[]; skipped: string[] } {
  const moved: string[] = [];
  const skipped: string[] = [];
  if (!existsSync(cardsRoot) || !statSync(cardsRoot).isDirectory()) {
    return { moved, skipped };
  }

  for (const lang of readdirSync(cardsRoot)) {
    const langDir = path.join(cardsRoot, lang);
    if (!statSync(langDir).isDirectory() || !isNarutoLangDir(lang)) continue;

    for (const set of readdirSync(langDir)) {
      const setCode = set.trim().toLowerCase();
      if (setCode === FANSET_SET) continue;
      const setDir = path.join(langDir, set);
      if (!statSync(setDir).isDirectory()) continue;

      for (const cardId of readdirSync(setDir)) {
        const diskId = (
          narutoDiskCardId(cardId, setCode) ?? cardId
        ).toLowerCase();
        if (!isNarutoFansetCollector(diskId)) continue;

        const from = path.join(setDir, cardId);
        if (!statSync(from).isDirectory()) continue;

        const destDir = path.join(langDir, FANSET_SET);
        mkdirSync(destDir, { recursive: true });
        const to = path.join(destDir, cardId);
        if (existsSync(to)) {
          skipped.push(`${lang}/${setCode}/${cardId}`);
          continue;
        }
        renameSync(from, to);
        moved.push(`${lang}/${setCode}/${cardId}→${FANSET_SET}/${cardId}`);
      }
    }
  }

  return { moved, skipped };
}
