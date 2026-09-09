import type { PrintCandidate } from "@/types/providerModule";

import { kayouCardBackUrlForRarity } from "./kayouBackTier";
import { kayouCardBackUrlForOfficialReference } from "./kayouOfficialCardBacks";
import { NARUTO_KAYOU_PACK_ID } from "./pack";

/** Per-card official back when known, else tier sleeve `cards/back.<tier>.webp`. */
export function stampKayouBack(candidate: PrintCandidate): PrintCandidate {
  const perCard = kayouCardBackUrlForOfficialReference(
    candidate.reference,
    candidate.rarity,
  );
  const url =
    perCard ??
    kayouCardBackUrlForRarity(NARUTO_KAYOU_PACK_ID, candidate.rarity);
  if (!url) return candidate;
  return { ...candidate, cardBackUrl: url };
}
