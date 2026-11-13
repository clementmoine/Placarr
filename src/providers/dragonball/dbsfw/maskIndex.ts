/**
 * Server scan of catalogue mask files, published to the browser-safe index
 * the Rendu tab reads. This module is imported only from server routes.
 */

import { readdirSync } from "node:fs";
import path from "node:path";

import { packCardsDir } from "@/lib/packPaths";

import { DBS_FW_FACE_LANGS, DBS_FW_PACK_ID } from "./indexStore";
import { setDbsFwMaskUrls } from "./masks";

const MASK_FILE = /^mask(?:-[a-z0-9-]+)?\.webp$/;

export function installDbsFwMaskIndex(): void {
  const root = packCardsDir(DBS_FW_PACK_ID);
  const urls: string[] = [];
  for (const lang of DBS_FW_FACE_LANGS) {
    const langDir = path.join(root, lang);
    let sets: string[] = [];
    try {
      sets = readdirSync(langDir);
    } catch {
      continue;
    }
    for (const set of sets) {
      let cards: string[] = [];
      try {
        cards = readdirSync(path.join(langDir, set));
      } catch {
        continue;
      }
      for (const card of cards) {
        let files: string[] = [];
        try {
          files = readdirSync(path.join(langDir, set, card));
        } catch {
          continue;
        }
        for (const file of files) {
          if (!MASK_FILE.test(file)) continue;
          urls.push(
            `/assets/${DBS_FW_PACK_ID}/cards/${lang}/${set}/${card}/${file}`,
          );
        }
      }
    }
  }
  setDbsFwMaskUrls(urls);
}
