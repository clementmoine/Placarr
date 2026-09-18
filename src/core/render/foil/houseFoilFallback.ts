/**
 * Honest « this print is shiny, but we have no dedicated look yet ».
 *
 * Runtime chain (all TCG packs):
 * 1. WebGL when preference allows and a material exists
 * 2. Else CSS for the requested finish / leaf when ported
 * 3. Else house {@link HOUSE_FOIL_FALLBACK_CSS_ID} (`flare`)
 *
 * Plain / None finishes stay flat — callers must not pass them here.
 */
export const HOUSE_FOIL_FALLBACK_CSS_ID = "flare" as const;

/**
 * When a shiny finish has no CSS look id yet, return the house flare band.
 * Keeps an already-resolved id; leaves empty / `None` as null.
 */
export function applyHouseFoilFallback(
  finishShaderId: string | null | undefined,
  finish: string | null | undefined,
): string | null {
  const id = typeof finishShaderId === "string" ? finishShaderId.trim() : "";
  if (id) return id;
  const f = (finish ?? "").trim();
  if (!f || /^none$/i.test(f)) return null;
  return HOUSE_FOIL_FALLBACK_CSS_ID;
}
