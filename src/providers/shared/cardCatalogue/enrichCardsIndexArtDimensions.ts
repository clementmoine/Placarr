import path from "node:path";

import { readFileRawImageDimensions } from "@/core/enrich/media/imageMetrics";
import { parsePrintKey } from "@/core/identify/printKey";
import { isCardsIndexV1 } from "@/effects/cardsIndex";
import { packCardDir } from "@/lib/packPaths";
import {
  loadCardsIndexDoc,
  persistCardsIndexDoc,
} from "@/providers/shared/cardCatalogue/cardsIndexDoc";
import { providerModuleProviding } from "@/providers/shared/packOwner";

/**
 * Probe on-disk face files for orientation (raw file pixels — never the
 * margin-trimmed display box, which skews aspect and lenticular strip checks). Soft no-op when no CardsIndex
 * doc remains in sqlite (identity lives elsewhere).
 *
 * Also stamps `coverProvenance` from the pack's `coverProvenanceForArtFile`
 * when present (listing_photo vs catalog) so Catalogue tiles can demote
 * marketplace dumps without name lists.
 */
export async function enrichCardsIndexArtDimensions(
  packId: string,
): Promise<{ probed: number; landscapePrints: number }> {
  const index = loadCardsIndexDoc(packId);
  if (!index) {
    return { probed: 0, landscapePrints: 0 };
  }
  if (!isCardsIndexV1(index)) {
    throw new Error(`cards-index doc invalide : ${packId}`);
  }
  const provenanceOf = providerModuleProviding(
    packId,
    "coverProvenanceForArtFile",
  )?.coverProvenanceForArtFile;
  let probed = 0;
  let landscapePrints = 0;

  for (const [printKey, entry] of Object.entries(index.cards)) {
    let printLandscape = false;
    let probedThis = 0;
    const grouping = parsePrintKey(printKey)?.grouping?.trim().toLowerCase();
    const diskCard = grouping ? `${entry.card}-${grouping}` : entry.card;
    for (const [lang, slot] of Object.entries(entry.langs)) {
      const art = slot.art?.trim();
      if (!art) continue;
      const stamped = provenanceOf?.(art)?.trim();
      if (stamped) slot.coverProvenance = stamped;
      else delete slot.coverProvenance;
      const artPath = path.join(
        packCardDir(packId, {
          set: entry.set,
          lang,
          card: diskCard,
        }),
        art,
      );
      const dims = await readFileRawImageDimensions(artPath);
      if (!dims) continue;
      slot.artW = dims.width;
      slot.artH = dims.height;
      probed += 1;
      probedThis += 1;
      if (dims.width > dims.height) printLandscape = true;
    }
    // Once we measured at least one face, landscapePrint follows pixels only —
    // a stale curated/rarity flag must not keep rotating portrait scans.
    if (probedThis > 0) {
      if (printLandscape) {
        entry.landscapePrint = true;
        landscapePrints += 1;
      } else {
        delete entry.landscapePrint;
      }
    }
  }

  persistCardsIndexDoc(packId, index);
  return { probed, landscapePrints };
}
