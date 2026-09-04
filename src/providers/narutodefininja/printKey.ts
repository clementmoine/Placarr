import { buildPrintKey } from "@/core/identify/printKey";

import { NARUTO_DEFI_NINJA_PRINT_GAME } from "./pack";

/** Jeu de 50 cartes 404 Éditions (ISBN/EAN 9791032407592). */
export const NARUTO_DEFI_NINJA_SET_CODE = "main";

/** `definija:main-01`. */
export function defiNinjaPrintKey(number: string): string | null {
  return buildPrintKey({
    game: NARUTO_DEFI_NINJA_PRINT_GAME,
    set: NARUTO_DEFI_NINJA_SET_CODE,
    number,
  });
}

export function formatDefiNinjaReference(
  _cardType: string,
  number: string,
  _grouping?: string | null,
): string {
  const digits = number.trim().replace(/^0+/, "") || "0";
  return digits.padStart(2, "0");
}

export function normalizeDefiNinjaSearchQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;
  const m = trimmed.match(/^0*(\d{1,2})$/);
  if (!m) return trimmed;
  return m[1]!.padStart(2, "0");
}

export function defiNinjaSetLabel(
  setCode: string,
  language?: string | null,
): string {
  const code = setCode.trim().toLowerCase();
  const lang = (language ?? "fr").trim().toLowerCase();
  if (code === NARUTO_DEFI_NINJA_SET_CODE) {
    return lang === "en" ? "Ninja Challenge" : "Le défi ninja";
  }
  return setCode.trim().toUpperCase();
}

export function defiNinjaSetSortKey(setCode: string): number | null {
  const code = setCode.trim().toLowerCase();
  if (code === NARUTO_DEFI_NINJA_SET_CODE) return 1;
  return null;
}
