/**
 * OPTCG category → sleeve back under `cards/back.<slug>.webp`.
 *
 * Character (and unknown) stay on the pack default — do not stamp a print-scoped
 * URL so grid skeletons can still share the pack back.
 */
import { assetsPackFileUrl } from "@/lib/packAssetUrls";
import type { PrintCandidate } from "@/types/providerModule";

import { ONEPIECE_PACK_ID } from "./pack";

const CATEGORY_BACK_SLUGS = {
  leader: "leader",
  event: "event",
  stage: "stage",
} as const;

export type OnepieceBackCategory = keyof typeof CATEGORY_BACK_SLUGS;

export function onepieceBackCategorySlug(
  category: string | null | undefined,
  rarity?: string | null,
): OnepieceBackCategory | null {
  const raw = category?.trim().toLowerCase() ?? "";
  if (raw === "leader" || raw === "event" || raw === "stage") return raw;
  // Pre-category DBs: Leaders almost always carry rarity "Leader".
  if ((rarity?.trim().toLowerCase() ?? "") === "leader") return "leader";
  return null;
}

export function onepieceCardBackUrlForCategory(
  category: string | null | undefined,
  rarity?: string | null,
  packId: string = ONEPIECE_PACK_ID,
): string | null {
  const slug = onepieceBackCategorySlug(category, rarity);
  if (!slug) return null;
  return assetsPackFileUrl(packId, "cards", `back.${CATEGORY_BACK_SLUGS[slug]}.webp`);
}

/** Stamp Leader / Event / Stage sleeves; leave Character on the pack default. */
export function stampOnepieceBack(candidate: PrintCandidate): PrintCandidate {
  if (candidate.cardBackUrl) return candidate;
  const url = onepieceCardBackUrlForCategory(
    candidate.category,
    candidate.rarity,
  );
  if (!url) return candidate;
  return { ...candidate, cardBackUrl: url };
}
