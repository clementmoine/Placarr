/**
 * OPTCG category → sleeve back under `cards/back.<slug>.webp`.
 *
 * Only stamp when the motif is distinct from the pack default (`back.webp`).
 * Character / Event / Stage share the blue sleeve → pack default (no stamp).
 * Leader (red) and DON!! (cream) get print-scoped URLs when files exist.
 */
import { assetsPackFileUrl } from "@/lib/packAssetUrls";
import type { PrintCandidate } from "@/types/providerModule";

import { ONEPIECE_PACK_ID } from "./pack";

/** Categories with a dedicated sleeve file (when installed). */
const DISTINCT_BACK_SLUGS = {
  leader: "leader",
  don: "don",
} as const;

export type OnepieceBackCategory = keyof typeof DISTINCT_BACK_SLUGS;

export function onepieceBackCategorySlug(
  category: string | null | undefined,
  rarity?: string | null,
): OnepieceBackCategory | null {
  const raw = category?.trim().toLowerCase() ?? "";
  if (raw === "leader") return "leader";
  if (raw === "don" || raw === "don!!" || raw === "don!") return "don";
  // Pre-category DBs: Leaders almost always carry rarity "Leader".
  if ((rarity?.trim().toLowerCase() ?? "") === "leader") return "leader";
  // Event / Stage / Character → pack default (identical blue sleeve).
  return null;
}

export function onepieceCardBackUrlForCategory(
  category: string | null | undefined,
  rarity?: string | null,
  packId: string = ONEPIECE_PACK_ID,
): string | null {
  const slug = onepieceBackCategorySlug(category, rarity);
  if (!slug) return null;
  return assetsPackFileUrl(
    packId,
    "cards",
    `back.${DISTINCT_BACK_SLUGS[slug]}.webp`,
  );
}

/** Stamp Leader / DON!! sleeves; leave Character / Event / Stage on pack default. */
export function stampOnepieceBack(candidate: PrintCandidate): PrintCandidate {
  if (candidate.cardBackUrl) return candidate;
  const url = onepieceCardBackUrlForCategory(
    candidate.category,
    candidate.rarity,
  );
  if (!url) return candidate;
  return { ...candidate, cardBackUrl: url };
}
