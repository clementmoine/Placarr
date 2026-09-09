/**
 * Stamp Kayou house finishes + full-face foil mask on catalogue candidates.
 *
 * Collection finish axis (`hr`, `mr`, `bp`, `holo`) differs from Foils-tab
 * materials (`hr-2x2`, `hr-3x1`, …) — see `lenticularTypes.ts`.
 */
import { NARUTO_KAYOU_FULL_FOIL_MASK_URL } from "@/effects/narutokayou";
import type { PrintCandidate } from "@/types/providerModule";

const PLAIN_FINISH = "normal";

/** Shiny finishes a collector can hold — not the playroom material grid. */
const KAYOU_COLLECTION_SHINY = ["holo", "hr", "mr", "bp"] as const;

/**
 * Rarity → shiny finish for the print picker / collection tiles.
 */
export function kayouShinyFinish(
  rarity: string | null | undefined,
): string | null {
  const r = rarity?.trim().toUpperCase() ?? "";
  if (!r || r === "R" || r === "N" || r === "C") return null;
  if (r === "HR") return "hr";
  if (r === "MR") return "mr";
  if (r === "BP") return "bp";
  return "holo";
}

export function kayouFinishesForRarity(
  rarity: string | null | undefined,
): string[] {
  const shiny = kayouShinyFinish(rarity);
  if (!shiny) return [PLAIN_FINISH];
  const finishes = [PLAIN_FINISH, shiny];
  if (
    (shiny === "hr" || shiny === "mr" || shiny === "bp") &&
    KAYOU_COLLECTION_SHINY.includes("holo")
  ) {
    finishes.push("holo");
  }
  return finishes;
}

export function stampKayouFoil(candidate: PrintCandidate): PrintCandidate {
  const finishes = kayouFinishesForRarity(candidate.rarity);
  return {
    ...candidate,
    finishes,
    plainFinishes: finishes.filter((finish) => finish === PLAIN_FINISH),
    foilMaskUrl: NARUTO_KAYOU_FULL_FOIL_MASK_URL,
  };
}
