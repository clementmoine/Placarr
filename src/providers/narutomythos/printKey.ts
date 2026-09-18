import { buildPrintKey } from "@/core/identify/printKey";

import { NARUTO_MYTHOS_PRINT_GAME } from "./pack";
import {
  NARUTO_MYTHOS_KS1E2_SET_CODE,
  NARUTO_MYTHOS_KS1PROMO_SET_CODE,
} from "./parseOfficialCards";

/** Konoha Shidō — Chapitre 1 (1re édition FR). */
export const NARUTO_MYTHOS_KS1_SET_CODE = "ks1";
/** Shinobi Shiren — Chapitre 2. */
export const NARUTO_MYTHOS_SS2_SET_CODE = "ss2";
/** Akatsuki — Chapitre 3. */
export const NARUTO_MYTHOS_AK3_SET_CODE = "ak3";

export {
  NARUTO_MYTHOS_KS1E2_SET_CODE,
  NARUTO_MYTHOS_KS1PROMO_SET_CODE,
};

const SET_DENOMINATOR: Readonly<Record<string, number>> = {
  [NARUTO_MYTHOS_KS1_SET_CODE]: 130,
  [NARUTO_MYTHOS_KS1E2_SET_CODE]: 130,
  [NARUTO_MYTHOS_KS1PROMO_SET_CODE]: 130,
  [NARUTO_MYTHOS_SS2_SET_CODE]: 140,
  [NARUTO_MYTHOS_AK3_SET_CODE]: 140,
};

/** `mythos:ks1-0001` / `mythos:ks1-0001-a` / `mythos:ks1-m01` / `mythos:ss2-mss01`. */
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

function denominatorForSet(setCode: string): number {
  return SET_DENOMINATOR[setCode.trim().toLowerCase()] ?? 130;
}

/**
 * Référence imprimée : `001/130`, `001/140 A`, `001/140 V`, `MSS01`,
 * `M1`, `XXXX/1000`, `000/000`.
 */
export function formatMythosReference(
  cardType: string,
  number: string,
  grouping?: string | null,
): string {
  const n = number.trim().toLowerCase();
  if (n.startsWith("mss") && /^\d+$/.test(n.slice(3))) {
    return `MSS${n.slice(3).padStart(2, "0")}`;
  }
  if (n.startsWith("m") && /^\d+$/.test(n.slice(1))) {
    return `M${n.slice(1)}`;
  }
  if (n === "000") return "000/000";
  if (n.startsWith("lg")) {
    return denominatorForSet(cardType) === 130 ? "XXXX/1000" : "000/000";
  }
  const digits = n.replace(/^0+/, "") || "0";
  const padded = digits.padStart(3, "0");
  const base = `${padded}/${denominatorForSet(cardType)}`;
  const g = grouping?.trim().toLowerCase() || "";
  if (!g) return base;
  if (g === "a" || g.startsWith("a")) return `${base} A`;
  if (g === "v" || g.startsWith("v")) return `${base} V`;
  if (g === "l" || g.startsWith("l")) return `${base} L`;
  if (g === "s" && !g.startsWith("sv") && !g.startsWith("sp") && !g.startsWith("shinobi")) {
    return `${base} S`;
  }
  if (g.startsWith("sv")) return `${base} SV`;
  if (g === "sg" || g.startsWith("shinobi")) return `${base} SG`;
  if (g.startsWith("chibi")) return `${base} Chibi`;
  if (g.startsWith("pop")) return `${base} POP`;
  if (g.startsWith("sp")) return `${base} SP`;
  if (g === "h" || g.startsWith("gold") || g.includes("gold")) {
    return `${base} ${g.toUpperCase()}`;
  }
  return `${base} ${g.toUpperCase()}`;
}

/** `001/130 A`, `1/140`, `MSS8`, `M8` → formes cherchables en base. */
export function normalizeMythosSearchQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;
  const mss = trimmed.match(/^mss\s*0*(\d+)$/i);
  if (mss) return `mss${mss[1]!.padStart(2, "0")}`;
  const mission = trimmed.match(/^m\s*(\d+)$/i);
  if (mission) return `m${mission[1]}`;
  const legendary = trimmed.match(/^0+\s*\/\s*0+$/);
  if (legendary) return "000";
  const m = trimmed.match(/^(\d{1,3})\s*\/\s*(130|140)(?:\s*[A-Za-z]+)?$/i);
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
  if (code === NARUTO_MYTHOS_KS1E2_SET_CODE) {
    return lang === "en"
      ? "Konoha Shidō — Chapter 1 (2nd ed.)"
      : "Konoha Shidō — Chapitre 1 (2e éd.)";
  }
  if (code === NARUTO_MYTHOS_KS1PROMO_SET_CODE) {
    return lang === "en" ? "Mythos Promo Cards" : "Cartes Promo Mythos";
  }
  if (code === NARUTO_MYTHOS_SS2_SET_CODE) {
    return lang === "en" ? "Shinobi Shiren — Chapter 2" : "Shinobi Shiren — Chapitre 2";
  }
  if (code === NARUTO_MYTHOS_AK3_SET_CODE) {
    return "Akatsuki — Chapitre 3";
  }
  return setCode.trim().toUpperCase();
}

export function mythosSetSortKey(setCode: string): number | null {
  const code = setCode.trim().toLowerCase();
  if (code === NARUTO_MYTHOS_KS1_SET_CODE) return 1;
  if (code === NARUTO_MYTHOS_KS1E2_SET_CODE) return 1.5;
  if (code === NARUTO_MYTHOS_KS1PROMO_SET_CODE) return 1.7;
  if (code === NARUTO_MYTHOS_SS2_SET_CODE) return 2;
  if (code === NARUTO_MYTHOS_AK3_SET_CODE) return 3;
  return null;
}
