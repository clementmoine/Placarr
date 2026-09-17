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
  /** 4ᵉ vague Card Battle — préfixe `DT-` (火の国庵 + borne). */
  dt: {
    code: "dt",
    labelJa: "ナルティメットカードバトル（第4弾）",
    labelEn: "Narultimate Card Battle (Wave 4)",
    year: 2006,
  },
  nm: {
    code: "nm",
    labelJa: "ナルティメットミッション",
    labelEn: "Narultimate Mission",
    year: 2007,
  },
  /** 疾風クリアカード Mission (`NC-…`). */
  nc: {
    code: "nc",
    labelJa: "疾風クリアカード",
    labelEn: "Shippuuden Clear Card",
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
  /** Promos Cross (`NXP-…`). */
  nxp: {
    code: "nxp",
    labelJa: "クロスプロモ",
    labelEn: "Cross Promo",
    year: 2009,
  },
  /** Annexes Cross (`NXpf-…` / NXPF). */
  nxpf: {
    code: "nxpf",
    labelJa: "クロス特別",
    labelEn: "Cross Special",
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
  /** Annexes Formation File (`NFF-…`). */
  nff: {
    code: "nff",
    labelJa: "フォーメーションファイル",
    labelEn: "Formation File",
    year: 2008,
  },
  /** Promos Cross McDonald's (`NX-MAC…` / NXMAC). */
  nxmac: {
    code: "nxmac",
    labelJa: "クロスマクドナルドプロモ",
    labelEn: "Cross McDonald's Promo",
    year: 2009,
  },
  /** 疾風クリアカード2 Formation (`NFC-…`). */
  nfc: {
    code: "nfc",
    labelJa: "疾風クリアカード2",
    labelEn: "Shippuuden Clear Card 2",
    year: 2008,
  },
  /** Design rares Cross (`NX-CAM…`). */
  nxcam: {
    code: "nxcam",
    labelJa: "クロスデザインレア",
    labelEn: "Cross Design Rare",
    year: 2009,
  },
  /** SP Cross romains (`NX-SP I/II/III`). */
  nxsp: {
    code: "nxsp",
    labelJa: "クロスSP",
    labelEn: "Cross SP",
    year: 2009,
  },
  /** SP Cross promo (`NXP-SP I/II`). */
  nxpsp: {
    code: "nxpsp",
    labelJa: "クロスプロモSP",
    labelEn: "Cross Promo SP",
    year: 2009,
  },
  /** Promo CAN (`CAN-…`). */
  can: {
    code: "can",
    labelJa: "CANプロモ",
    labelEn: "CAN Promo",
    year: 2007,
  },
} as const;

export type DataCarddassSetCode = keyof typeof DATA_CARDDASS_SETS;

const SET_CODES = new Set(Object.keys(DATA_CARDDASS_SETS));

/**
 * `DN-032T` / `DN-051-R` / `NF-141` / `NFP-018` → set + number.
 * Suffixe lettre collé ou séparé par `-` (T, R…).
 */
const ROMAN_SP: Record<string, string> = {
  I: "001",
  II: "002",
  III: "003",
};

export function parseDataCarddassPrinted(raw: string): {
  set: DataCarddassSetCode;
  number: string;
  printed: string;
} | null {
  const trimmed = raw.trim().replace(/\s+/g, "");
  // NFM-SP (non-numeric annex).
  if (/^NFM-?SP$/i.test(trimmed)) {
    return { set: "nfm", number: "sp", printed: "NFM-SP" };
  }
  // NX-SP I / NX-SPI / NX-SP-III (roman only — not NXP-SP2).
  const nxSp = trimmed.match(/^NX-?SP-?(III|II|I)$/i);
  if (nxSp) {
    const roman = nxSp[1]!.toUpperCase();
    return {
      set: "nxsp",
      number: ROMAN_SP[roman]!,
      printed: `NX-SP-${roman}`,
    };
  }
  const nxpSp = trimmed.match(/^NXP-?SP-?(II|I)$/i);
  if (nxpSp) {
    const roman = nxpSp[1]!.toUpperCase();
    return {
      set: "nxpsp",
      number: ROMAN_SP[roman]!,
      printed: `NXP-SP-${roman}`,
    };
  }
  // Longest prefixes first (NX-CAM before NX, NFP before NF, …).
  const m = trimmed.match(
    /^(NXPF|NX-CAM|NXCAM|NX-MAC|NXMAC|NFP|NFM|NFC|NFF|NXP|DNP|DMP|CAN|DN|DT|NM|NC|NF|NX)[-]?(\d+)(?:[-]?([A-Za-z]))?$/i,
  );
  if (!m) return null;
  const rawPrefix = m[1]!.toLowerCase().replace(/-/g, "");
  if (!SET_CODES.has(rawPrefix)) return null;
  const num = m[2]!.padStart(3, "0");
  const suffix = m[3]?.toLowerCase() ?? "";
  const printed =
    rawPrefix === "nxcam"
      ? `NX-CAM-${num}${suffix.toUpperCase()}`
      : rawPrefix === "can"
        ? `CAN-${num}${suffix.toUpperCase()}`
        : trimmed.toUpperCase();
  return {
    set: rawPrefix as DataCarddassSetCode,
    number: `${num}${suffix}`,
    printed,
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

/**
 * Suruga omits sometimes the letter suffix (`DN-080` vs checklist `DN-080T`).
 * Keep the bare number when known; otherwise, if exactly one lettered variant
 * exists for those digits, take it. Ambiguous / unknown → null.
 */
export function resolveDataCarddassNumberAgainstKnown(
  setCode: string,
  number: string,
  knownSetNumberKeys: ReadonlySet<string>,
): { set: DataCarddassSetCode; number: string } | null {
  const set = setCode.trim().toLowerCase();
  if (!isDataCarddassSetCode(set)) return null;
  const num = number.trim().toLowerCase();
  if (!num) return null;
  const exact = `${set}:${num}`;
  if (knownSetNumberKeys.has(exact)) return { set, number: num };
  if (!/^\d+$/.test(num)) return null;
  const hits: string[] = [];
  const prefix = `${set}:`;
  for (const key of knownSetNumberKeys) {
    if (!key.startsWith(prefix)) continue;
    const kn = key.slice(prefix.length);
    if (kn.length === num.length + 1 && kn.startsWith(num) && /[a-z]$/.test(kn)) {
      hits.push(kn);
    }
  }
  if (hits.length !== 1) return null;
  return { set, number: hits[0]! };
}

/**
 * Suruga install resolver: checklist/print known keys first, then accept the
 * Suruga number as-is for promo sets with zero checklist rows (CAN, NX-CAM…).
 */
export function resolveDataCarddassSurugaListing(
  setCode: string,
  number: string,
  knownSetNumberKeys: ReadonlySet<string>,
  setsWithChecklistRows: ReadonlySet<string>,
): { set: DataCarddassSetCode; number: string } | null {
  const known = resolveDataCarddassNumberAgainstKnown(
    setCode,
    number,
    knownSetNumberKeys,
  );
  if (known) return known;
  const set = setCode.trim().toLowerCase();
  if (!isDataCarddassSetCode(set)) return null;
  if (setsWithChecklistRows.has(set)) return null;
  const num = number.trim().toLowerCase();
  if (!/^\d+[a-z]?$|^sp$/i.test(num)) return null;
  return { set, number: num };
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
