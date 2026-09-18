/**
 * Prefer kayouofficial.com gallery fronts when they map onto checklist numbers.
 * Wedding `◇MR` scans are native landscape — better than CapsuleCorp `-H-` pivots.
 */
import type { KayouChecklist, KayouChecklistCard } from "./kayouLedgerTypes";
import {
  readKayouOfficialCatalog,
  type KayouOfficialCatalog,
} from "./kayouOfficialCrawl";
import { kayouOfficialIdToCcNumber } from "./kayouOfficialId";
import { canonicalizeKayouNumber } from "./kayouIdNormalize";

function preferOfficialFace(
  card: KayouChecklistCard,
  frontImage: string,
): KayouChecklistCard {
  const url = frontImage.trim();
  if (!url) return card;
  if (card.faceUrl === url) return card;
  const alts = new Set(card.faceUrlAlternates ?? []);
  if (card.faceUrl?.trim()) alts.add(card.faceUrl.trim());
  alts.delete(url);
  return {
    ...card,
    faceUrl: url,
    faceSource: "kayouofficial",
    ...(alts.size ? { faceUrlAlternates: [...alts] } : {}),
  };
}

/** Attach official `frontImage` URLs onto matching `cc.*` checklist rows. */
export function enrichChecklistWithOfficialFaces(
  checklist: KayouChecklist,
  catalog: KayouOfficialCatalog | null = readKayouOfficialCatalog(),
): KayouChecklist {
  if (!catalog?.series?.length) return checklist;

  const byNumber = new Map<string, string>();
  for (const series of catalog.series) {
    for (const card of series.cards) {
      const number = kayouOfficialIdToCcNumber(card.idCode);
      const front = card.frontImage?.trim();
      if (!number || !front) continue;
      // Prefer landscape official scans when several idCodes collide.
      const prev = byNumber.get(number);
      const land =
        typeof card.frontWidth === "number" &&
        typeof card.frontHeight === "number" &&
        card.frontWidth > card.frontHeight;
      if (!prev || land) byNumber.set(number, front);
    }
  }
  if (!byNumber.size) return checklist;

  return {
    ...checklist,
    sets: checklist.sets.map((set) => ({
      ...set,
      cards: set.cards.map((card) => {
        const number = canonicalizeKayouNumber(card.number);
        const front = byNumber.get(number);
        return front ? preferOfficialFace(card, front) : card;
      }),
    })),
  };
}
