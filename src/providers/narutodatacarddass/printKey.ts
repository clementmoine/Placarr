/**
 * Printed refs Data Carddass — cabinets DN/NM/NF/NX + annexes promo.
 */
import { buildPrintKey } from "@/core/identify/printKey";

import { NARUTO_DATA_CARDDASS_PRINT_GAME } from "./pack";

/** Cabinets arcade (+ annexes promo documentées cardcheckbox). */
export const DATA_CARDDASS_SETS = {
  dn: {
    code: "dn",
    labelJa: "ナルティメットカードバトル",
    labelEn: "Narultimate Card Battle",
    year: 2005,
  },
  nm: {
    code: "nm",
    labelJa: "ナルティメットミッション",
    labelEn: "Narultimate Mission",
    year: 2007,
  },
  nf: {
    code: "nf",
    labelJa: "ナルティメットフォーメーション",
    labelEn: "Narultimate Formation",
    year: 2007,
  },
  nx: {
    code: "nx",
    labelJa: "ナルティメットクロス",
    labelEn: "Narultimate Cross",
    year: 2009,
  },
  /** Promos V-Jump / mail DN (DNP-…). */
  dnp: {
    code: "dnp",
    labelJa: "DNプロモ",
    labelEn: "DN Promo",
    year: 2005,
  },
  /** Promos Mission (DMP-…). */
  dmp: {
    code: "dmp",
    labelJa: "ミッションプロモ",
    labelEn: "Mission Promo",
    year: 2007,
  },
  /** Campagne / promo Formation (NFP-…). */
  nfp: {
    code: "nfp",
    labelJa: "フォーメーションプロモ",
    labelEn: "Formation Promo",
    year: 2008,
  },
  /** Annexes Formation (NFM-…). */
  nfm: {
    code: "nfm",
    labelJa: "フォーメーション特別",
    labelEn: "Formation Special",
    year: 2008,
  },
} as const;

export type DataCarddassSetCode = keyof typeof DATA_CARDDASS_SETS;

const SET_CODES = new Set(Object.keys(DATA_CARDDASS_SETS));

/**
 * `DN-032T` / `DN-051-R` / `NF-141` / `NFP-018` → set + number.
 * Suffixe lettre collé ou séparé par `-` (T, R…).
 */
export function parseDataCarddassPrinted(raw: string): {
  set: DataCarddassSetCode;
  number: string;
  printed: string;
} | null {
  const trimmed = raw.trim().replace(/\s+/g, "");
  // Longest prefixes first (NFP before NF, DNP before DN, …).
  const m = trimmed.match(
    /^(NFP|NFM|NFC|NXP|DNP|DMP|DN|NM|NF|NX)[-]?(\d+)(?:[-]?([A-Za-z]))?$/i,
  );
  if (!m) return null;
  const prefix = m[1]!.toLowerCase();
  if (!SET_CODES.has(prefix)) return null;
  const num = m[2]!.padStart(3, "0");
  const suffix = m[3]?.toLowerCase() ?? "";
  return {
    set: prefix as DataCarddassSetCode,
    number: `${num}${suffix}`,
    printed: trimmed.toUpperCase(),
  };
}

export function isDataCarddassSetCode(value: string): value is DataCarddassSetCode {
  return SET_CODES.has(value.trim().toLowerCase());
}

/** `datacarddass:dn-032t`. */
export function dataCarddassPrintKey(
  setCode: string,
  number: string,
): string | null {
  return buildPrintKey({
    game: NARUTO_DATA_CARDDASS_PRINT_GAME,
    set: setCode,
    number,
  });
}

export function formatDataCarddassReference(
  cardType: string,
  number: string,
  _grouping?: string | null,
): string {
  const set = cardType.trim().toUpperCase();
  const n = number.trim().toLowerCase();
  const m = n.match(/^(\d+)([a-z]?)$/);
  if (!m) return `${set}-${number.toUpperCase()}`;
  const digits = m[1]!.replace(/^0+/, "") || "0";
  const suffix = m[2] ? m[2].toUpperCase() : "";
  return `${set}-${digits}${suffix}`;
}

export function normalizeDataCarddassSearchQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;
  const parsed = parseDataCarddassPrinted(trimmed);
  if (parsed) return parsed.number;
  return trimmed.toLowerCase();
}

export function dataCarddassSetLabel(
  setCode: string,
  language?: string | null,
): string {
  const code = setCode.trim().toLowerCase() as DataCarddassSetCode;
  const entry = DATA_CARDDASS_SETS[code];
  if (!entry) return setCode.trim().toUpperCase();
  const lang = (language ?? "ja").trim().toLowerCase();
  if (lang === "en") return entry.labelEn;
  return entry.labelJa;
}

export function dataCarddassSetSortKey(setCode: string): number | null {
  const code = setCode.trim().toLowerCase() as DataCarddassSetCode;
  const entry = DATA_CARDDASS_SETS[code];
  return entry?.year ?? null;
}
