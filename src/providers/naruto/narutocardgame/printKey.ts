import { buildPrintKey } from "@/core/identify/printKey";

import { NARUTO_CARDGAME_PRINT_GAME } from "./pack";

/**
 * `launch` = scellés précommande (display…).
 * `preview` = 12 Character SAMPLE galerie officielle (sans n° collector).
 */
export const NARUTO_CARDGAME_LAUNCH_SET = "launch";
export const NARUTO_CARDGAME_PREVIEW_SET = "preview";

export function narutoCardgamePrintKey(
  setCode: string,
  number: string,
): string | null {
  return buildPrintKey({
    game: NARUTO_CARDGAME_PRINT_GAME,
    set: setCode.trim().toLowerCase(),
    number: number.trim().toLowerCase(),
    grouping: null,
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
  return setCode.trim().toUpperCase() || setCode;
}

export function narutoCardgameSetSortKey(setCode: string): number | null {
  const code = setCode.trim().toLowerCase();
  if (code === NARUTO_CARDGAME_PREVIEW_SET) return 2026.5;
  if (code === NARUTO_CARDGAME_LAUNCH_SET) return 2027;
  return null;
}
