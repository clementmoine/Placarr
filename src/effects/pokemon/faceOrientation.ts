/**
 * Pokémon prints that share the standard TCG rectangle but sit on their side
 * (XY BREAK / TURBO). Catalogue signals — not pixel dimensions (assets stay
 * portrait files with sideways content).
 */

import type { FaceQuarterTurns } from "@/lib/text/cardFormat";

export function faceQuarterTurnsForPokemonPrint(signals: {
  stage?: string | null;
  rarityCode?: string | null;
}): FaceQuarterTurns {
  if (signals.rarityCode === "BreakRare") return 1;
  const stage = signals.stage?.trim().toUpperCase() ?? "";
  if (stage === "BREAK" || stage === "TURBO") return 1;
  return 0;
}
