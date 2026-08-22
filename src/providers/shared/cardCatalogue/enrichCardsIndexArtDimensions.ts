import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readFileImageMetrics } from "@/core/enrich/media/imageMetrics";
import { cataloguePackInfo } from "@/lib/admin/cataloguePacks";
import { artSlotIsLandscape } from "@/lib/text/artFaceOrientation";
import type { CardsIndexV1 } from "@/effects/cardsIndex";
import { isCardsIndexV1 } from "@/effects/cardsIndex";
import { packCardDir, packCardsIndexPath } from "@/lib/packPaths";

/**
 * Probe on-disk face files and persist `artW` / `artH` (+ `landscapePrint`)
 * into `cards-index.json` so catalogue + print lookup know orientation without
 * a curated ledger.
 */
export async function enrichCardsIndexArtDimensions(
  packId: string,
): Promise<{ probed: number; landscapePrints: number }> {
  const dest = packCardsIndexPath(packId);
  const raw = JSON.parse(readFileSync(dest, "utf8")) as unknown;
  if (!isCardsIndexV1(raw)) {
    throw new Error(`cards-index invalide : ${dest}`);
  }
  const index = raw as CardsIndexV1;
  let probed = 0;
  let landscapePrints = 0;

  const catalogueLocales = cataloguePackInfo(packId)?.catalogueLocales;
  if (catalogueLocales?.length) {
    for (const entry of Object.values(index.cards)) {
      for (const lang of catalogueLocales) {
        entry.langs[lang] ??= {};
      }
    }
  }

  for (const entry of Object.values(index.cards)) {
    let printLandscape = entry.landscapePrint === true;
    for (const [lang, slot] of Object.entries(entry.langs)) {
      const art = slot.art?.trim();
      if (!art) continue;
      const artPath = path.join(
        packCardDir(packId, {
          set: entry.set,
          lang,
          card: entry.card,
        }),
        art,
      );
      const dims = await readFileImageMetrics(artPath);
      if (!dims) continue;
      slot.artW = dims.width;
      slot.artH = dims.height;
      probed += 1;
      if (dims.width > dims.height) printLandscape = true;
    }
    if (printLandscape) {
      entry.landscapePrint = true;
      landscapePrints += 1;
    } else {
      delete entry.landscapePrint;
    }
  }

  writeFileSync(dest, `${JSON.stringify(index)}\n`);
  return { probed, landscapePrints };
}
