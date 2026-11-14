/**
 * Rareté catalogue JCC → finish foil maison (flare + full-face mask).
 * Une carte Holo / Prism est un tirage à part — pas un choix sur une commune.
 *
 * Hors-série SP : dbzcollection met le canal (« Hors série ») dans Rareté ;
 * le tirage physique FR est foil (SP-01/04/22/25, D-86) — attestation retail
 * « holo / prisme » + scans brillants.
 */
import { DBS_JCC_FULL_FOIL_MASK_URL } from "@/effects/dbsjcc";
import type { PrintCandidate } from "@/types/providerModule";

import type { LocalPrintSearchRow } from "@/providers/shared/cardCatalogue/localPrintsIndex";

/** Canonical finish keys declared on the effect pack. */
export function dbsjccFinishFromRarity(
  rarity: string | null | undefined,
): "holo" | "prism" | null {
  const key = rarity?.trim().toLowerCase() ?? "";
  if (!key) return null;
  if (key === "prism") return "prism";
  // « Holo », « Holographique », …
  if (key.includes("holo")) return "holo";
  return null;
}

/** dbzc channel label misfiled as rarity on set `sp`. */
export function isDbsjccHorsSerieRarityLabel(
  rarity: string | null | undefined,
): boolean {
  const key = rarity
    ?.trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[-\s]+/g, " ")
    ?? "";
  return key === "hors serie";
}

export function dbsjccFinishForPrint(
  setCode: string | null | undefined,
  rarity: string | null | undefined,
): "holo" | "prism" | null {
  const fromRarity = dbsjccFinishFromRarity(rarity);
  if (fromRarity) return fromRarity;
  if (
    setCode?.trim().toLowerCase() === "sp" &&
    isDbsjccHorsSerieRarityLabel(rarity)
  ) {
    return "holo";
  }
  return null;
}

export function decorateDbsjccCandidate(
  candidate: PrintCandidate,
  row: LocalPrintSearchRow,
): PrintCandidate {
  const rarity = row.rarity ?? candidate.rarity;
  const finish = dbsjccFinishForPrint(row.setCode, rarity);
  if (!finish) return candidate;
  /*
    SP / foil-only channel labels stay foil-only. When a face was also attested
    as a non-foil rarity (Rare/Commune) before a Holo stamp won the merge,
    keep a plain slot so master-set can still tick both.
  */
  const foilOnly =
    row.setCode?.trim().toLowerCase() === "sp" ||
    isDbsjccHorsSerieRarityLabel(rarity);
  return {
    ...candidate,
    // Surface real finish rarity when dbzc only had the channel label.
    ...(isDbsjccHorsSerieRarityLabel(rarity) ? { rarity: "Holo" } : {}),
    finishes: [finish],
    plainFinishes: foilOnly ? [] : ["None"],
    // Read only once the finish is resolved (blank variant → implied finish).
    foilMaskUrl: DBS_JCC_FULL_FOIL_MASK_URL,
  };
}
