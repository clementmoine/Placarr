import { buildPrintKey } from "@/core/identify/printKey";

import { canonicalizeKayouNumber, canonicalizeKayouNumberForSet } from "./kayouIdNormalize";
import { NARUTO_KAYOU_PRINT_GAME } from "./pack";

/** `kayou:t1w1-nr.r.001` — points à la place des tirets du code imprimé. */
export function kayouPrintKey(setCode: string, number: string): string | null {
  return buildPrintKey({
    game: NARUTO_KAYOU_PRINT_GAME,
    set: setCode,
    number: canonicalizeKayouNumberForSet(setCode, number),
  });
}

/** `NR-R-001` / `nr-r-001` / `NR-SS-HR-011` → dotted + canonical for DB match. */
export function normalizeKayouSearchQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;
  // Code imprimé typique : PREFIX-RARITY-NUM (incl. NR-SS-HR-011)
  if (/^[A-Za-z0-9]{1,6}(?:-[A-Za-z0-9]+){1,3}-\d+[A-Za-z0-9]*$/i.test(trimmed)) {
    return canonicalizeKayouNumber(trimmed.toLowerCase().replace(/-/g, "."));
  }
  if (/^[a-z0-9]+(?:\.[a-z0-9]+)+$/i.test(trimmed)) {
    return canonicalizeKayouNumber(trimmed.toLowerCase());
  }
  return trimmed;
}

/** `nr.r.001` → `NR-R-001`. */
export function formatKayouReference(
  _cardType: string,
  number: string,
  _grouping?: string | null,
): string {
  const n = number.trim().toLowerCase();
  if (!n.includes(".")) return n.toUpperCase();
  return n
    .split(".")
    .map((part) => part.toUpperCase())
    .join("-");
}

export function kayouSetLabel(setCode: string): string {
  return setCode.trim().toUpperCase();
}

/** Ordre approximatif : t1…t4, ex, boxes / specials en dernier. */
export function kayouSetSortKey(setCode: string): number | null {
  const code = setCode.trim().toLowerCase();
  const wave = code.match(/^t(\d+)(?:5)?w(\d+)$/);
  if (wave) {
    const chapter = Number(wave[1]);
    const w = Number(wave[2]);
    const mid = code.includes("t25") || code.startsWith("t25") ? 25 : chapter * 10;
    return mid * 100 + w;
  }
  if (code.startsWith("ex")) {
    const n = Number(code.replace(/\D/g, "")) || 0;
    return 9000 + n;
  }
  return 10_000;
}
