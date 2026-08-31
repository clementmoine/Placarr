import { buildPrintKey } from "@/core/identify/printKey";

import { NARUTO_MYTHOS_PRINT_GAME } from "./pack";

/** Konoha Shidō — Chapitre 1 (1re édition FR). */
export const NARUTO_MYTHOS_KS1_SET_CODE = "ks1";

/** `mythos:ks1-0001` / `mythos:ks1-0001-a` / `mythos:ks1-m01`. */
export function mythosPrintKey(
  setCode: string,
  number: string,
  grouping?: string | null,
): string | null {
  return buildPrintKey({
    game: NARUTO_MYTHOS_PRINT_GAME,
    set: setCode,
    number,
    grouping,
  });
}

/**
 * Référence imprimée : `001/130`, `001/130 A`, `001/130 V`, `001/130 SG`,
 * `M1`, `XXXX/1000`.
 */
export function formatMythosReference(
  _cardType: string,
  number: string,
  grouping?: string | null,
): string {
  const n = number.trim().toLowerCase();
  if (n.startsWith("m") && /^\d+$/.test(n.slice(1))) {
    return `M${n.slice(1)}`;
  }
  if (n.startsWith("lg")) {
    return "XXXX/1000";
  }
  const digits = n.replace(/^0+/, "") || "0";
  const padded = digits.padStart(3, "0");
  const base = `${padded}/130`;
  const g = grouping?.trim().toLowerCase();
  if (g === "a") return `${base} A`;
  if (g === "v") return `${base} V`;
  if (g === "sg") return `${base} SG`;
  return base;
}

/** `001/130 A`, `1/130`, `M8` → formes cherchables en base. */
export function normalizeMythosSearchQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;
  const mission = trimmed.match(/^m\s*(\d+)$/i);
  if (mission) return `m${mission[1]}`;
  const m = trimmed.match(/^(\d{1,3})\s*\/\s*130(?:\s*[A-Za-z]+)?$/i);
  if (!m) return trimmed;
  // Le numéro seul suffit : Rare Art / V partagent le collector number.
  return m[1]!.padStart(4, "0");
}

export function mythosSetLabel(
  setCode: string,
  language?: string | null,
): string {
  const code = setCode.trim().toLowerCase();
  const lang = (language ?? "fr").trim().toLowerCase();
  if (code === NARUTO_MYTHOS_KS1_SET_CODE) {
    return lang === "en"
      ? "Konoha Shidō — Chapter 1"
      : "Konoha Shidō — Chapitre 1";
  }
  return setCode.trim().toUpperCase();
}

export function mythosSetSortKey(setCode: string): number | null {
  const code = setCode.trim().toLowerCase();
  if (code === NARUTO_MYTHOS_KS1_SET_CODE) return 1;
  return null;
}
