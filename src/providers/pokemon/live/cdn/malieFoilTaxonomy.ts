/**
 * Malie export foil taxonomy (`foil.type` / `foil.mask`) ↔ Live / Placarr leaves.
 *
 * Spec: https://malie.io/static/draft/html/pkproto_sv.html (2024-05-20 draft).
 * Live client / longForm / `Foil Effect` columns use PascalCase (`SvHolo`);
 * Malie **export** JSON and pokebox use SCREAMING_SNAKE (`SV_HOLO`).
 * Database bootstrap already stores Live-shaped names — use this when reading
 * export JSON or pokebox-shaped labels.
 *
 * @see docs/archive/tcglive_effects.md — do not feed export labels into frags.
 */

/** Malie export `foil.type` (SCREAMING_SNAKE). */
export const MALIE_EXPORT_FOIL_TYPES = [
  "ACE_FOIL",
  "COSMOS",
  "CRACKED_ICE",
  "FLAT_SILVER",
  "RAINBOW",
  "STAMPED",
  "SUN_PILLAR",
  "SV_HOLO",
  "SV_ULTRA",
  "SV_ULTRA_SCODIX",
] as const;

export type MalieExportFoilType = (typeof MALIE_EXPORT_FOIL_TYPES)[number];

/** Malie export `foil.mask` — coarser than Live CastAndCure / laminates. */
export const MALIE_EXPORT_FOIL_MASKS = [
  "HOLO",
  "REVERSE",
  "ETCHED",
  "STAMPED",
] as const;

export type MalieExportFoilMask = (typeof MALIE_EXPORT_FOIL_MASKS)[number];

/**
 * Export type → Live `foil_effect` / `.frag` stem (PascalCase).
 * Spec notes: `RAINBOW` is **not** “Rainbow Rare” in SV — mainly Pokéball /
 * Masterball parallel holos (Live still names the layer `Rainbow`).
 */
const EXPORT_TYPE_TO_LIVE: Readonly<Record<MalieExportFoilType, string>> = {
  ACE_FOIL: "AceFoil",
  COSMOS: "Cosmos",
  CRACKED_ICE: "CrackedIce",
  FLAT_SILVER: "FlatSilver",
  RAINBOW: "Rainbow",
  STAMPED: "Stamped",
  SUN_PILLAR: "SunPillar",
  SV_HOLO: "SvHolo",
  SV_ULTRA: "SvUltra",
  SV_ULTRA_SCODIX: "SvUltraScodix",
};

const EXPORT_MASK_TO_LIVE: Readonly<Record<MalieExportFoilMask, string>> = {
  HOLO: "Holo",
  REVERSE: "Reverse",
  ETCHED: "Etched",
  STAMPED: "Stamped",
};

function screamingToLiveGuess(raw: string): string {
  return raw
    .trim()
    .split("_")
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "sv" || lower === "sw") {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

/** Map Malie export / pokebox `foil.type` → Live leaf name, or null if empty. */
export function liveFoilEffectFromMalieExportType(
  type: string | null | undefined,
): string | null {
  const raw = (type ?? "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase().replace(/\s+/g, "_");
  if (upper in EXPORT_TYPE_TO_LIVE) {
    return EXPORT_TYPE_TO_LIVE[upper as MalieExportFoilType];
  }
  // Already Live-shaped (bootstrap databases / longForm)
  if (/^[A-Z][A-Za-z0-9]*$/.test(raw) && !raw.includes("_")) return raw;
  return screamingToLiveGuess(upper);
}

/** Map Malie export `foil.mask` → Live mask token (Holo / Reverse / …). */
export function liveFoilMaskFromMalieExportMask(
  mask: string | null | undefined,
): string | null {
  const raw = (mask ?? "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase().replace(/\s+/g, "_");
  if (upper in EXPORT_MASK_TO_LIVE) {
    return EXPORT_MASK_TO_LIVE[upper as MalieExportFoilMask];
  }
  if (/^[A-Z][A-Za-z0-9]*$/.test(raw) && !raw.includes("_")) return raw;
  return screamingToLiveGuess(upper);
}

/**
 * Product lesson from the draft: export `RAINBOW` ≠ collector “Rainbow Rare”.
 * In SV scope it is mainly Pokéball / Masterball reverse laminates.
 */
export function malieExportRainbowIsNotRainbowRare(): boolean {
  return true;
}
