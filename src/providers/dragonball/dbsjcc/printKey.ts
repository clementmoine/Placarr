import { buildPrintKey } from "@/core/identify/printKey";

import { DBS_JCC_PRINT_GAME } from "./pack";

const SET_LABELS: Readonly<Record<string, string>> = {
  part1: "Part 1",
  part2: "Part 2",
  part3: "Part 3",
  part4: "Part 4",
  part5: "Part 5",
  part6: "Part 6",
  part7: "Part 7",
  part8: "Part 8",
  part9: "Part 9",
  part10: "Part 10",
  promo: "Part Promo",
  sp: "Hors-Série",
};

/**
 * Normalise un code de numéro imprimé JCC :
 * `D-1` -> `d0001`
 * `D-123` -> `d0123`
 * `SP-01` -> `sp0001`
 * `SP-25` -> `sp0025`
 */
export function parseDbsjccNumber(raw: string): string | null {
  const clean = raw.trim().toUpperCase();
  const m = clean.match(/^(?:(SP|D)\s*[-_]?\s*)?(\d+)$/i);
  if (!m) return null;
  const prefix = (m[1] ?? "D").toLowerCase();
  const n = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

/**
 * Nettoie le slug de regroupement (variante de pouvoir caché ou rareté).
 * Ne doit contenir aucun séparateur (`:` ou `-`) pour respecter le format printKey.
 */
export function normalizeGrouping(raw: string): string | null {
  const clean = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9.]+/g, "");
  return clean || null;
}

/**
 * Construit un printKey canonique JCC Dragon Ball :
 * `dbsjcc:part1-d0001`
 * `dbsjcc:part4-d0431-kaio`
 * `dbsjcc:sp-sp0001`
 */
export function dbsjccPrintKey(
  setCode: string,
  number: string,
  grouping?: string | null,
): string | null {
  const parsedNumber = parseDbsjccNumber(number);
  if (!parsedNumber) return null;
  const group = grouping ? normalizeGrouping(grouping) : null;
  return buildPrintKey({
    game: DBS_JCC_PRINT_GAME,
    set: setCode.trim().toLowerCase(),
    number: parsedNumber,
    grouping: group,
  });
}

export function dbsjccSetLabel(setCode: string): string {
  const key = setCode.trim().toLowerCase();
  return SET_LABELS[key] ?? key.toUpperCase();
}

export function formatDbsjccReference(
  setCode: string,
  number: string,
  rarityLabel?: string | null,
  pouvoirCache?: string | null,
): string {
  const set = dbsjccSetLabel(setCode);
  const clean = number
    .trim()
    .toUpperCase()
    .replace(/^([A-Z]+)\s*(\d+)$/, "$1-$2");
  const base = `${set} ${clean}`;
  const details = [pouvoirCache?.trim(), rarityLabel?.trim()].filter(Boolean);
  return details.length ? `${base} (${details.join(", ")})` : base;
}
