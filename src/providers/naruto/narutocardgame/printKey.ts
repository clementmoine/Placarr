import { buildPrintKey } from "@/core/identify/printKey";

import { NARUTO_CARDGAME_PRINT_GAME } from "./pack";

/**
 * `launch` = scellés précommande (display…).
 * `preview` = 12 Character SAMPLE galerie officielle (sans n° collector).
 * `demo` = cartes révélées Gen Con / decks démo (N-/C-/S-/K-…).
 * `promo` = Chakra CP-001 (Yankees, Gen Con, event…).
 * `premium00` = Premium Card Collection vol.00.
 * `n01` = révélations SAMPLE set 1 / starters (sans n° collector).
 */
export const NARUTO_CARDGAME_LAUNCH_SET = "launch";
export const NARUTO_CARDGAME_PREVIEW_SET = "preview";
export const NARUTO_CARDGAME_DEMO_SET = "demo";
export const NARUTO_CARDGAME_PROMO_SET = "promo";
export const NARUTO_CARDGAME_PREMIUM00_SET = "premium00";
export const NARUTO_CARDGAME_N01_SET = "n01";

export function narutoCardgamePrintKey(
  setCode: string,
  number: string,
  grouping?: string | null,
): string | null {
  return buildPrintKey({
    game: NARUTO_CARDGAME_PRINT_GAME,
    set: setCode.trim().toLowerCase(),
    number: number.trim().toLowerCase(),
    grouping: grouping?.trim().toLowerCase() || null,
  });
}

export function formatNarutoCardgameReference(
  setCode: string,
  number: string,
): string {
  const code = setCode.trim().toLowerCase();
  const n = number.trim().toUpperCase();
  if (code === NARUTO_CARDGAME_PREVIEW_SET) {
    return `GALLERY-${n.replace(/^G/, "")}`;
  }
  if (
    code === NARUTO_CARDGAME_DEMO_SET ||
    code === NARUTO_CARDGAME_PROMO_SET ||
    code === NARUTO_CARDGAME_PREMIUM00_SET
  ) {
    // `cp001` / `cp001-yankees` (number + grouping déjà joints par l’appelant).
    return n.toUpperCase();
  }
  if (code === NARUTO_CARDGAME_N01_SET) {
    return n.toUpperCase().replace(/^SAMPLE0*/, "SAMPLE-");
  }
  const set = setCode.trim().toUpperCase();
  return set ? `${set}-${n}` : n;
}

export function narutoCardgameSetLabel(setCode: string): string {
  const code = setCode.trim().toLowerCase();
  if (code === NARUTO_CARDGAME_LAUNCH_SET) {
    return "Worldwide Launch (été 2027)";
  }
  if (code === NARUTO_CARDGAME_PREVIEW_SET) {
    return "Official artwork gallery (SAMPLE)";
  }
  if (code === NARUTO_CARDGAME_DEMO_SET) {
    return "Demo / Gen Con SAMPLE";
  }
  if (code === NARUTO_CARDGAME_PROMO_SET) {
    return "Promo (Chakra CP)";
  }
  if (code === NARUTO_CARDGAME_PREMIUM00_SET) {
    return "Premium Card Collection vol.00";
  }
  if (code === NARUTO_CARDGAME_N01_SET) {
    return 'Set 1 "Here Comes Naruto Uzumaki!" (SAMPLE)';
  }
  return setCode.trim().toUpperCase() || setCode;
}

export function narutoCardgameSetSortKey(setCode: string): number | null {
  const code = setCode.trim().toLowerCase();
  if (code === NARUTO_CARDGAME_PREVIEW_SET) return 2026.4;
  if (code === NARUTO_CARDGAME_DEMO_SET) return 2026.5;
  if (code === NARUTO_CARDGAME_PROMO_SET) return 2026.6;
  if (code === NARUTO_CARDGAME_PREMIUM00_SET) return 2026.7;
  if (code === NARUTO_CARDGAME_N01_SET) return 2026.8;
  if (code === NARUTO_CARDGAME_LAUNCH_SET) return 2027;
  return null;
}
