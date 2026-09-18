import { readFileSync } from "node:fs";

import { isCardsIndexV1, type CardsIndexV1 } from "@/effects/cardsIndex";
import {
  artSlotIsLandscape,
  orientationFromIndexSlot,
  printIsLandscapeCard,
  resolveArtFaceOrientation,
  type ArtFaceOrientation,
} from "@/lib/text/artFaceOrientation";
import { packCardsIndexPath } from "@/lib/packPaths";

const cache = new Map<string, CardsIndexV1>();

function loadPackIndex(packId: string): CardsIndexV1 | null {
  const cached = cache.get(packId);
  if (cached) return cached;
  const dest = packCardsIndexPath(packId);
  try {
    const raw = JSON.parse(readFileSync(dest, "utf8")) as unknown;
    if (!isCardsIndexV1(raw)) return null;
    cache.set(packId, raw);
    return raw;
  } catch {
    return null;
  }
}

export function artOrientationForPackPrint(
  packId: string,
  printKey: string,
  lang: string | null | undefined,
): (ArtFaceOrientation & { landscapePrint?: boolean }) | null {
  const index = loadPackIndex(packId);
  if (!index) return null;
  const key = printKey?.trim().toLowerCase();
  if (!key) return null;
  const entry = index.cards[key];
  if (!entry) return null;
  const landscapePrint = printIsLandscapeCard(entry);
  /*
    `lang` may be null when the catalogue row comes from a LEFT JOIN with no
    title yet — checklist / search must still resolve landscapePrint without
    throwing on `.trim()`.
  */
  const langKey = lang?.trim().toLowerCase();
  const slot = langKey ? entry.langs[langKey] : undefined;

  if (slot) {
    const orient = orientationFromIndexSlot(entry, slot);
    if (orient.landscapeFace || orient.faceQuarterTurns) {
      return { ...orient, ...(landscapePrint ? { landscapePrint: true } : {}) };
    }
    if (
      landscapePrint &&
      typeof slot.artW === "number" &&
      typeof slot.artH === "number"
    ) {
      return {
        ...resolveArtFaceOrientation(slot.artW, slot.artH, {
          printIsLandscape: true,
        }),
        landscapePrint: true,
      };
    }
  }

  if (!landscapePrint) return null;

  if (Object.values(entry.langs).some(artSlotIsLandscape)) {
    return { landscapeFace: true, landscapePrint: true };
  }

  return { landscapeFace: true, landscapePrint: true };
}

/** @internal test hook */
export function resetCardsIndexOrientationCache(): void {
  cache.clear();
}
