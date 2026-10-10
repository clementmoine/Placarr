/**
 * Lorcana Locations share the standard TCG rectangle but sit on their side.
 * Catalogue `cardType` — not pixel dimensions (assets stay portrait files with
 * sideways content), same idea as Pokémon BREAK.
 */

import type { FaceQuarterTurns } from "@/lib/text/cardFormat";

/** Localised spellings of Location across LorcanaJSON languages. */
const LOCATION_TYPES = new Set(["location", "lieu", "ort", "luogo"]);

export function faceQuarterTurnsForLorcanaPrint(signals: {
  cardType?: string | null;
}): FaceQuarterTurns {
  const type = signals.cardType?.trim().toLowerCase() ?? "";
  if (type && LOCATION_TYPES.has(type)) return 1;
  return 0;
}
