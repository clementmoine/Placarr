import { buildPrintKey } from "@/core/identify/printKey";

import { DBS_JCC_PRINT_GAME } from "./pack";

/** Libellé court packaging / refs (`Série 1 D-1`) — terme Bandai FR, pas dbzc « Part ». */
const SET_LABELS_SHORT: Readonly<Record<string, string>> = {
  part1: "Série 1",
  part2: "Série 2",
  part3: "Série 3",
  part4: "Série 4",
  part5: "Série 5",
  part6: "Série 6",
  part7: "Série 7",
  part8: "Série 8",
  part9: "Série 9",
  part10: "Série 10",
  promo: "Série Promo",
  sp: "Hors-Série",
  accessory: "Accessoire",
};

/**
 * Carte-outil rouge « DETECTEUR » — identique dans tous les starters Série 4–10.
 * Pas un SKU scellé par série (dbzc les listait en éphémères distincts).
 */
export const DBSJCC_DETECTEUR_SET = "accessory";
export const DBSJCC_DETECTEUR_NUMBER = "detecteur";
export const DBSJCC_DETECTEUR_PRINT_KEY = "dbsjcc:accessory-detecteur";

/** Thème packaging (DCM) — composé en `Série N — …` comme Naruto Carddass. */
const SET_THEMES: Readonly<Record<string, string>> = {
  part1: "Super-Saiyans",
  part2: "L'Éveil de Gohan",
  part3: "Championnat du Monde",
  part4: "Vaincre la Menace",
  part5: "Planète / Résistance",
  part6: "Fusion",
  part7: "Origine",
  part8: "Nouvelle Épreuve",
  part9: "Héros",
  part10: "Guerriers Légendaires",
};

/**
 * Normalise un code de numéro imprimé JCC :
 * `D-1` -> `d0001`
 * `D-123` -> `d0123`
 * `D-123a` / `d0123a` -> `d0123a` (lettre = variante d'illustration)
 * `SP-01` -> `sp0001`
 * `SP-25` -> `sp0025`
 */
export function parseDbsjccNumber(raw: string): string | null {
  const clean = raw.trim().toUpperCase();
  const m = clean.match(/^(?:(SP|D)\s*[-_]?\s*)?(\d+)([A-Z])?$/i);
  if (!m) return null;
  const prefix = (m[1] ?? "D").toLowerCase();
  const n = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  const letter = (m[3] ?? "").toLowerCase();
  return `${prefix}${String(n).padStart(4, "0")}${letter}`;
}

/** `d0123a` → `{ base: "d0123", artLetter: "a" }`. */
export function splitDbsjccNumber(raw: string): {
  base: string;
  artLetter: string | null;
} | null {
  const parsed = parseDbsjccNumber(raw);
  if (!parsed) return null;
  const m = /^(d|sp)(\d+)([a-z]?)$/i.exec(parsed);
  if (!m) return { base: parsed, artLetter: null };
  const base = `${m[1]!.toLowerCase()}${m[2]}`;
  const artLetter = m[3] ? m[3].toLowerCase() : null;
  return { base, artLetter };
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

export function dbsjccSetShortLabel(setCode: string): string {
  const key = setCode.trim().toLowerCase();
  return SET_LABELS_SHORT[key] ?? key.toUpperCase();
}

/**
 * Libellé set pour UI / checklist — même schéma que Naruto Carddass :
 * `Série N — thème`, `Promo (hors série)`, `Hors-série`, `Détecteur`.
 */
export function dbsjccSetLabel(setCode: string): string {
  const key = setCode.trim().toLowerCase();
  const theme = SET_THEMES[key];
  if (theme) {
    const n = /^part(\d+)$/.exec(key)?.[1];
    return n ? `Série ${n} — ${theme}` : theme;
  }
  if (key === "promo") return "Promo (hors série)";
  if (key === "sp") return "Hors-série";
  if (key === "accessory") return "Détecteur";
  return SET_LABELS_SHORT[key] ?? key.toUpperCase();
}

/**
 * Code court en tête de libellé (`S1 — Série 1 — …`), comme `s1` → `S1` chez
 * Naruto. Promo / SP : id disque. Détecteur : pas de préfixe (voir
 * {@link dbsjccSetPrefixCode}).
 */
export function dbsjccSetDisplayCode(setCode: string): string | null {
  const key = setCode.trim().toLowerCase();
  const part = /^part(\d+)$/.exec(key);
  if (part) return `S${part[1]}`;
  return null;
}

/** `false` pour le Détecteur — évite `ACCESSORY — Détecteur`. */
export function dbsjccSetPrefixCode(setCode: string): boolean {
  return setCode.trim().toLowerCase() !== "accessory";
}

/** Série 1…10 chronologiques, puis Promo, Hors-Série, Accessoire. */
export function dbsjccSetSortKey(setCode: string): number | null {
  const key = setCode.trim().toLowerCase();
  const part = /^part(\d+)$/.exec(key);
  if (part) {
    const n = Number.parseInt(part[1]!, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (key === "promo") return 100;
  if (key === "sp") return 101;
  if (key === "accessory") return 102;
  return null;
}

/**
 * Référence collectionneur pour le picker / la check-list : `D-127`, `SP-25`,
 * `D-123a` (variante d'illustration).
 * `number` accepte l'id disque (`d0127` / `d0123a`) ou l'imprimé (`D-127`).
 */
export function formatDbsjccCollectorReference(
  _setCode: string,
  number: string,
  grouping?: string | null,
): string {
  const raw = number.trim();
  if (raw.toLowerCase() === DBSJCC_DETECTEUR_NUMBER) return "Détecteur";
  const disk = /^(d|sp)0*(\d+)([a-z]?)$/i.exec(raw);
  const printed = disk
    ? `${disk[1]!.toUpperCase()}-${disk[2]!}${disk[3]?.toLowerCase() ?? ""}`
    : raw
        .toUpperCase()
        .replace(/^([A-Z]+)\s*[-_]?\s*(\d+)([A-Z]?)$/, (_, p, n, l) =>
          `${p}-${Number.parseInt(n, 10)}${(l ?? "").toLowerCase()}`,
        );
  const group = grouping?.trim();
  // Lettres d'art vivent dans le numéro ; le grouping reste le pouvoir (kaio…).
  return group ? `${printed} (${group})` : printed;
}

/** Starters Série 4–10 : 1 Détecteur inclus (packaging Bandai). */
export function dbsjccStarterIncludesDetecteur(slug: string): boolean {
  return /^part(?:[4-9]|10)-starter\b/i.test(slug.trim());
}

export function formatDbsjccReference(
  setCode: string,
  number: string,
  rarityLabel?: string | null,
  pouvoirCache?: string | null,
): string {
  const set = dbsjccSetShortLabel(setCode);
  const clean = formatDbsjccCollectorReference(setCode, number);
  const base = `${set} ${clean}`;
  const details = [pouvoirCache?.trim(), rarityLabel?.trim()].filter(Boolean);
  return details.length ? `${base} (${details.join(", ")})` : base;
}
