/**
 * Action module: identity.ts
 * Merged from: packs.ts, collectorIdentity.ts, facts.ts, appearanceSets.ts, officialNames.ts, officialFrChecklist.ts, knownCards.ts
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPrintKey, parsePrintKey } from "@/core/identify/printKey";
import type { CardsIndexV1 } from "@/effects/cardsIndex";
import { dataRoot } from "@/lib/runtimeData";
import type { MetadataFact } from "@/types/metadataProvider";
import { pickPreferredFaceArtFilename } from "./parse/bandai";
import {
  normalizeCardNumber,
  type MangaNewsCardType,
} from "./parse/catalogues";
import { listNarutoCardDirs } from "./disk";
import { type NarutoPrintRow, type NarutoTitleRow } from "./indexStore";
import { loadAttestedPromos } from "./sources/promos";
import {
  NARUTO_INDICATIVE_PRICE_SOURCE,
  narutoIndicativeQuoteForPrint,
} from "./sources/prices";

// --- packs (client-safe leaf; re-exported for identity action API) ---

import {
  NARUTO_PACK_ID,
  NARUTO_EN_PACK_ID,
  type NarutoCardLine,
  isNarutoDataCarddassPrintedRef,
  narutoCatalogueLineForCard,
  narutoCatalogueLineForSealed,
  narutoDataPackForCard,
} from "./packs";

export {
  NARUTO_PACK_ID,
  NARUTO_EN_PACK_ID,
  type NarutoCardLine,
  isNarutoDataCarddassPrintedRef,
  narutoCatalogueLineForCard,
  narutoCatalogueLineForSealed,
  narutoDataPackForCard,
};

// --- from collectorIdentity.ts ---

/**
 * Collector identity from what is printed on the card — type + number.
 *
 * Series (`s7`, 巻ノ四, Coils) is a release appearance, not part of the number.
 * Prefixes share a **numeration family** (sort / voisinage), not identity:
 *   NI / 忍     Carddass ninja     N     CCG ninja
 *   TE / 術     Carddass jutsu     J     CCG jutsu
 *   TA / ST / 作  Carddass mission  M     CCG mission
 *   CL / 依     Carddass client    C     CCG client
 *   KI / 騎     Carddass knight    —     never printed outside JP
 * 騎士 (Temujin and the Gelel knights) is a fifth base type, minted inside
 * regular releases — 騎-1〜6 on the 2005-08 拡張ファイリングシート and 騎-7〜8
 * in 巻ノ十三 (cardcheckbox ranges), with nikita serving `K-007.jpg`. It is not
 * an alternate product line: it sits beside 忍/術/作/依, hence its own family
 * rather than an entry in ALT_LINE_DISK_PREFIXES.
 * JP alternate product lines keep their own disk tree and search needles — they
 * do not sit beside NI/N/J/M. Printed 疾風伝 refs fold onto the ids we store:
 * 忍伝 → `shi`, 術伝 → `mju`, 作伝 → `msa`, 忍伝-学 → `gaku` (checked first, it
 * is a longer prefix than 忍伝).
 * `NI-001` sits beside `N-001`. They are not the same card until attested.
 * `N-US` / `J-US` / `M-US` / `C-US` are a different sequence (tin exclusives),
 * not `N-001` with a US stamp — they sort after that family's regular numbers.
 * Dedicated promo sequences (`PR-11`, `PR-忍-1`, `OP忍-1`, `PR騎-1`) are the
 * promo family — not a `-promo` stamp on `NI-001`. Tourney reprints
 * (`NI-023` + sigle PROMO) stay ninja with grouping `promo` for identity, and
 * sort with that promo family so the booster number is not a twin tile.
 */
export type NarutoCollectorFamily =
  | "ninja"
  | "jutsu"
  | "mission"
  | "client"
  | "knight"
  | "promo";

export type NarutoCollectorId = {
  family: NarutoCollectorFamily;
  number: number;
  grouping: string | null;
  printedPrefix: string;
};

const FAMILY_ORDER: readonly NarutoCollectorFamily[] = [
  "ninja",
  "jutsu",
  "mission",
  "client",
  "knight",
  "promo",
];

/**
 * Data Carddass arcade (DN / DT / NM / NX) — autre provider
 * (`narutodatacarddass`). Hors catalogue Carddass : `parseNarutoCollector`
 * rend `null` pour ces refs (pas de mint `naruto:dn-…`).
 */
const DATA_CARDDASS_PRINTED_RE =
  /^(dn|dt|nm|nx|nf|nfp|nfm|nfc|dnp|dmp|nxp)[-]?\d/i;

/** Longest Latin / JP prefix first so `ni` is not read as `n`. */
const PREFIX_FAMILY: ReadonlyArray<readonly [string, NarutoCollectorFamily]> = [
  ["忍伝-学", "ninja"],
  ["忍伝学", "ninja"],
  ["忍伝", "ninja"],
  ["術伝", "jutsu"],
  ["作伝", "mission"],
  ["依頼人", "client"],
  ["作戦", "mission"],
  ["PR作戦", "promo"],
  ["PR-作戦", "promo"],
  ["PR忍", "promo"],
  ["PR-忍", "promo"],
  ["PR術", "promo"],
  ["PR-術", "promo"],
  ["PR作", "promo"],
  ["PR-作", "promo"],
  ["PR依", "promo"],
  ["PR-依", "promo"],
  ["PR騎", "promo"],
  ["PR-騎", "promo"],
  ["OP忍", "promo"],
  ["作戦", "mission"],
  ["依頼人", "client"],
  ["騎士", "knight"],
  ["忍", "ninja"],
  ["術", "jutsu"],
  ["作", "mission"],
  ["依", "client"],
  ["騎", "knight"],
  ["prni", "promo"],
  ["prte", "promo"],
  ["prta", "promo"],
  ["prcl", "promo"],
  ["prki", "promo"],
  ["prus", "promo"],
  ["opni", "promo"],
  // Porte-cartes 木ノ葉絵巻 (`CAN-1`〜`CAN-6`) — not Data Carddass `CAN-001`.
  ["can", "promo"],
  // コイン PLUS / PLUS 2 (`COIN-1`〜`COIN-16`) — tabletop Carddass, not arcade.
  ["coin", "promo"],
  ["shi", "ninja"],
  ["mju", "jutsu"],
  ["msa", "mission"],
  ["gaku", "ninja"],
  ["nus", "ninja"],
  ["jus", "jutsu"],
  ["mus", "mission"],
  ["cus", "client"],
  ["nc", "ninja"],
  ["ex", "promo"],
  ["ni", "ninja"],
  ["te", "jutsu"],
  ["ju", "jutsu"],
  ["ta", "mission"],
  ["st", "mission"],
  ["mi", "mission"],
  ["cl", "client"],
  ["ki", "knight"],
  ["pr", "promo"],
  ["ps", "promo"],
  ["n", "ninja"],
  ["j", "jutsu"],
  ["m", "mission"],
  ["c", "client"],
];

const FAMILY_SEARCH_PREFIXES: Record<NarutoCollectorFamily, readonly string[]> =
  {
    ninja: ["ni", "n"],
    jutsu: ["te", "j", "ju"],
    mission: ["ta", "st", "m", "mi"],
    client: ["cl", "c"],
    knight: ["ki"],
    promo: ["pr", "ps", "prus", "can", "coin"],
  };

/** JP 幕 / 忍者学校 — own disk folder, not NI/N/J/M voisinage. */
export const ALT_LINE_DISK_PREFIXES = new Set(["shi", "gaku", "mju", "msa"]);

const LANG_ORDER = ["fr", "en", "ja", "jp"] as const;

const FAMILY_FOLDERS: readonly NarutoCollectorFamily[] = [
  "ninja",
  "jutsu",
  "mission",
  "client",
  "knight",
  "promo",
];

const DISK_LAYOUT_FOLDERS: readonly string[] = [
  ...FAMILY_FOLDERS,
  "gaku",
  "shi",
  "mju",
  "msa",
];

/** Carddass prefixes sort before CCG so NI sits left of N. Promo sequences last. */
const DISK_PREFIX_ORDER = [
  "ni",
  "n",
  "nus",
  "nc",
  "shi",
  "gaku",
  "te",
  "j",
  "jus",
  "mju",
  "ta",
  "m",
  "mus",
  "msa",
  "cl",
  "c",
  "cus",
  "ki",
  "pr",
  "ps",
  "prus",
  "ex",
  "prni",
  "opni",
  "prte",
  "prta",
  "prcl",
  "prki",
  "can",
  "coin",
] as const;

const PREFIX_RE = new RegExp(
  `^(${PREFIX_FAMILY.map(([p]) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})[-\\s]?(\\d+)(?:-(.+))?$`,
  "i",
);

/** CCG tin/US infix (`N-US097`) — not a grouping on `N-097`. */
const CCG_US_DISK_PREFIXES = new Set(["nus", "jus", "mus", "cus"]);

const CCG_US_PREFIX: Readonly<Record<string, string>> = {
  n: "nus",
  j: "jus",
  m: "mus",
  c: "cus",
};

const CCG_US_PRINTED: Readonly<Record<string, string>> = {
  nus: "N-US",
  jus: "J-US",
  mus: "M-US",
  cus: "C-US",
};

function foldPrintedNarutoRef(raw: string): string {
  let trimmed = raw.trim().replace(/\s+/g, "");
  const ps = /[（(]PS[）)]$/i.exec(trimmed);
  if (ps) trimmed = `${trimmed.slice(0, ps.index)}-ps`;
  return (
    trimmed
      .replace(/^N[-]?US[-]?/i, "nus")
      .replace(/^J[-]?US[-]?/i, "jus")
      .replace(/^M[-]?US[-]?/i, "mus")
      .replace(/^C[-]?US[-]?/i, "cus")
      .replace(/^PR[-]?US[-]?/i, "prus")
      .replace(/^PR[-]?作戦[-]?/i, "prta")
      .replace(/^PR[-]?作[-]?/i, "prta")
      .replace(/^PR[-]?忍[-]?/i, "prni")
      .replace(/^PR[-]?術[-]?/i, "prte")
      .replace(/^PR[-]?依[-]?/i, "prcl")
      .replace(/^PR[-]?騎[-]?/i, "prki")
      .replace(/^OP忍[-]?/i, "opni")
      .replace(/^忍伝[-]?学[-]?/i, "gaku")
      .replace(/^忍伝[-]?/i, "shi")
      .replace(/^術伝[-]?/i, "mju")
      .replace(/^作伝[-]?/i, "msa")
      // Coleka prints EN CCG foil promos as `Pr 005R` (R glued). Same grouping
      // as JP `PR忍-1-R` — not the untagged `PR-005`.
      .replace(/^(PR[-]?\d+)R$/i, (_m, head: string) => `${head}-R`)
  );
}

export function parseNarutoCollector(raw: string): NarutoCollectorId | null {
  // Arcade Data Carddass → `narutodatacarddass` (pas ce pack).
  if (DATA_CARDDASS_PRINTED_RE.test(raw.trim().replace(/\s+/g, ""))) {
    return null;
  }
  const folded = foldPrintedNarutoRef(raw);
  /*
    Data Carddass arcade also prints `CAN-001` (exactly 3 digits). The Carddass
    porte-cartes only minted `CAN-1`〜`CAN-6`. Do not use `0*\d{3}` — that also
    matches our disk id `can0005` (00 + 005).
  */
  if (/^CAN[-]?0\d{2}$/i.test(folded)) return null;
  const m = PREFIX_RE.exec(folded);
  if (!m) return null;
  let printedPrefix = m[1]!;
  let grouping: string | null = m[3] ?? null;
  const family = familyForPrefix(printedPrefix);
  if (!family) return null;
  const number = Number(m[2]);
  if (
    canonicalNarutoDiskPrefix(printedPrefix) === "can" &&
    (number < 1 || number > 6)
  ) {
    return null;
  }
  if (
    canonicalNarutoDiskPrefix(printedPrefix) === "coin" &&
    (number < 1 || number > 16)
  ) {
    return null;
  }
  if (grouping?.toLowerCase() === "us") {
    const usPrefix = CCG_US_PREFIX[canonicalNarutoDiskPrefix(printedPrefix)];
    if (usPrefix) {
      printedPrefix = usPrefix;
      grouping = null;
    }
  }
  return {
    family,
    number,
    grouping,
    printedPrefix,
  };
}

export function narutoFamilyForPrefix(
  prefix: string,
): NarutoCollectorFamily | null {
  return familyForPrefix(prefix);
}

function familyForPrefix(prefix: string): NarutoCollectorFamily | null {
  const lower = prefix.toLowerCase();
  for (const [token, family] of PREFIX_FAMILY) {
    if (token === prefix || token === lower) return family;
  }
  return null;
}

function paddedNumber(id: NarutoCollectorId): string {
  return String(id.number).padStart(4, "0");
}

/**
 * Disk / printKey prefix. Kanji and Coleka EU aliases fold onto the Latin
 * id we already store (`忍` → `ni`, `ST` → `ta`, `JU` → `j`). `n` stays `n`.
 */
export function canonicalNarutoDiskPrefix(printedPrefix: string): string {
  const lower = printedPrefix.toLowerCase();
  if (printedPrefix === "忍") return "ni";
  if (printedPrefix === "術") return "te";
  if (printedPrefix === "作" || printedPrefix === "作戦") return "ta";
  if (printedPrefix === "依" || printedPrefix === "依頼人") return "cl";
  if (printedPrefix === "騎" || printedPrefix === "騎士") return "ki";
  if (/^pr[-]?忍$/i.test(printedPrefix)) return "prni";
  if (/^op忍$/i.test(printedPrefix)) return "opni";
  if (/^pr[-]?術$/i.test(printedPrefix)) return "prte";
  if (/^pr[-]?(作|作戦)$/i.test(printedPrefix)) return "prta";
  if (/^pr[-]?依$/i.test(printedPrefix)) return "prcl";
  if (/^pr[-]?騎$/i.test(printedPrefix)) return "prki";
  if (printedPrefix === "忍伝-学" || printedPrefix === "忍伝学") return "gaku";
  if (printedPrefix === "忍伝") return "shi";
  if (printedPrefix === "術伝") return "mju";
  if (printedPrefix === "作伝") return "msa";
  if (lower === "st") return "ta";
  if (lower === "ju") return "j";
  if (lower === "mi") return "m";
  return lower;
}

export function isNarutoFamilyFolder(name: string): boolean {
  return DISK_LAYOUT_FOLDERS.includes(name.trim().toLowerCase());
}

/** Top-level folder under `cards/` — alt JP lines use their prefix, not ninja/jutsu/mission. */
export function narutoCardDiskFolder(id: NarutoCollectorId): string {
  const prefix = canonicalNarutoDiskPrefix(id.printedPrefix);
  if (ALT_LINE_DISK_PREFIXES.has(prefix)) return prefix;
  return id.family;
}

export function narutoFamilyFolder(
  family: NarutoCollectorFamily,
): NarutoCollectorFamily {
  return family;
}

/** Dedicated promo ids (`PR-11`, `PR-忍-1`) — not a `-promo` stamp on a retail number. */
const PROMO_SEQUENCE_PREFIXES = new Set([
  "pr",
  "ps",
  "prus",
  "prni",
  "opni",
  "prte",
  "prta",
  "prcl",
  "prki",
  "can",
  "coin",
]);

/**
 * Promo reprint of a retail number (`NI-023` handed out at a tourney) is not
 * the booster card. `pr011` / `prni0001` are already promo-family ids — do not
 * suffix them.
 */
export function narutoAppearanceGrouping(
  id: NarutoCollectorId,
  appearanceSet?: string | null,
): string | null {
  if (id.grouping) return id.grouping;
  const prefix = canonicalNarutoDiskPrefix(id.printedPrefix);
  if (
    (appearanceSet ?? "").trim().toLowerCase() === "promo" &&
    !PROMO_SEQUENCE_PREFIXES.has(prefix)
  ) {
    return "promo";
  }
  return null;
}

/** `ni001` / `N-001` / `忍-1` → `ni0001` / `n0001` / `ni0001`. */
export function narutoDiskCardId(
  raw: string,
  appearanceSet?: string | null,
): string | null {
  const id = parseNarutoCollector(raw);
  if (!id) return null;
  const prefix = canonicalNarutoDiskPrefix(id.printedPrefix);
  const n = paddedNumber(id);
  const grouping = narutoAppearanceGrouping(id, appearanceSet);
  return grouping ? `${prefix}${n}-${grouping}` : `${prefix}${n}`;
}

/** Printed-prefix + number. `ni001` ≠ `n001`. Grouping ignored (art fallback). */
export function narutoCollectorNumberKey(raw: string): string | null {
  const id = parseNarutoCollector(raw);
  if (!id) return null;
  return `${canonicalNarutoDiskPrefix(id.printedPrefix)}:${paddedNumber(id)}`;
}

/** One impression: prefix + number + grouping. */
export function narutoCollectorKey(raw: string): string | null {
  const id = parseNarutoCollector(raw);
  if (!id) return null;
  const prefix = canonicalNarutoDiskPrefix(id.printedPrefix);
  const n = paddedNumber(id);
  return id.grouping ? `${prefix}:${n}:${id.grouping}` : `${prefix}:${n}`;
}

/**
 * Illustration / tirage jamais imprimé hors Japon.
 * - `ps` : bonus PS1 忍-n（PS） (書き下ろし)
 * - `a` / `b` : doubles JP (`術-259-a`/`-b`, 雪姫 `忍-1-a`, …) — pas de carton FR/IT/EN
 */
const JP_ONLY_ARTWORK_GROUPINGS = new Set(["ps", "a", "b"]);

/** Tirage dont le recto n'existe que sur carton japonais — pas de tuile FR/IT/EN. */
export function isJpOnlyNarutoArtwork(cardOrNumber: string): boolean {
  const grouping = parseNarutoCollector(cardOrNumber)?.grouping?.toLowerCase();
  return grouping != null && JP_ONLY_ARTWORK_GROUPINGS.has(grouping);
}

/**
 * Disk ids that can store the same collector card (`ni001`, `n001`, `n0001`).
 * Data Carddass `NM` / `DN` never parse, so they stay out.
 */
export function narutoCollectorSearchNeedles(raw: string): string[] {
  const id = parseNarutoCollector(raw);
  if (!id) return [];
  const nums = new Set([
    String(id.number),
    String(id.number).padStart(3, "0"),
    String(id.number).padStart(4, "0"),
  ]);
  const prefix = canonicalNarutoDiskPrefix(id.printedPrefix);
  const prefixes =
    CCG_US_PRINTED[prefix] ||
    PROMO_SEQUENCE_PREFIXES.has(prefix) ||
    ALT_LINE_DISK_PREFIXES.has(prefix)
      ? [prefix]
      : FAMILY_SEARCH_PREFIXES[id.family];
  const out: string[] = [];
  for (const p of prefixes) {
    for (const n of nums) out.push(`${p}${n}`);
  }
  // JA listings write `PR忍-284` for disk `ni0284-promo`. Without the retail
  // `-promo` needle, search only hits dedicated `prni*`, never the stamp.
  const retailPromo = JA_PR_PREFIX_TO_RETAIL[prefix];
  if (retailPromo && !id.grouping) {
    for (const n of nums) out.push(`${retailPromo}${n}-promo`);
  }
  return out;
}

/**
 * Disk prefix → what is printed on the Japanese card / shop listing.
 * Google / Suruga / Mercari / carddas20 all index `忍-349`, never `NI-349`.
 * Latin disk ids (`ni0349`) stay the sort / path axis; this is display only.
 */
const DISK_TO_JA_PRINTED: Readonly<Record<string, string>> = {
  ni: "忍",
  te: "術",
  ta: "作",
  cl: "依",
  ki: "騎",
  prni: "PR忍",
  prte: "PR術",
  prta: "PR作",
  prcl: "PR依",
  prki: "PR騎",
  opni: "OP忍",
  // Printed on the card in Latin (`CAN-5`), same as shop listings.
  can: "CAN",
  coin: "COIN",
  shi: "忍伝",
  mju: "術伝",
  msa: "作伝",
  gaku: "忍伝-学",
};

/**
 * JA shops / Google list tourney `-promo` stamps as `PR忍-284`, not
 * `忍-284 · promo`. Disk stays `ni0284-promo`; this is display only.
 * Dedicated `prni*` already map via `DISK_TO_JA_PRINTED`.
 */
const JA_TOURNEY_PROMO_PRINTED: Readonly<Record<string, string>> = {
  ni: "PR忍",
  te: "PR術",
  ta: "PR作",
  cl: "PR依",
  ki: "PR騎",
};

/** Inverse of `JA_TOURNEY_PROMO_PRINTED` — search `PR忍-284` → `ni0284-promo`. */
const JA_PR_PREFIX_TO_RETAIL: Readonly<Record<string, string>> = {
  prni: "ni",
  prte: "te",
  prta: "ta",
  prcl: "cl",
  prki: "ki",
};

function isJaNarutoDisplayLang(lang?: string | null): boolean {
  const normalized = (lang ?? "").trim().toLowerCase();
  return normalized === "ja" || normalized === "jp";
}

/**
 * `ni0063` / `ni063` → `NI-063`. `nus0097` / `n0097-us` → `N-US097`.
 * With `lang: "ja"` on a Carddass JP numeration: `ni0349` → `忍-349`
 * (what collectors type into Google), not the latin transliteration.
 * JA tourney stamps (`ni0284-promo`) read `PR忍-284`, same as shop listings.
 */
export function formatNarutoReference(
  _setCode: string,
  number: string,
  lang?: string | null,
): string {
  const id = parseNarutoCollector(number);
  if (!id) return number;
  const prefix = canonicalNarutoDiskPrefix(id.printedPrefix);
  const grouping = id.grouping;
  const jaPrefix = isJaNarutoDisplayLang(lang)
    ? DISK_TO_JA_PRINTED[prefix]
    : undefined;
  if (jaPrefix) {
    // Listings drop leading zeros (`忍-3`, `PR忍-1`); 忍者学校 keeps 3 digits
    // like 疾風伝 (`忍伝-学007`).
    const digits =
      prefix === "gaku"
        ? String(id.number).padStart(3, "0")
        : String(id.number);
    const ref = `${jaPrefix}-${digits}`;
    if (!grouping) return ref;
    const g = grouping.toLowerCase();
    // Bonus PS1 cards are printed `忍-1（PS）`, not `忍-1-ps`.
    if (g === "ps") return `${jaPrefix}-${digits}（PS）`;
    if (g === "promo") {
      const tourney = JA_TOURNEY_PROMO_PRINTED[prefix];
      if (tourney) return `${tourney}-${digits}`;
      return `${ref} · promo`;
    }
    if (g === "prerelease") return `${ref} · prerelease`;
    return `${ref}-${grouping}`;
  }
  // Porte-cartes prints `CAN-5` (no zero pad) — same as JA shops / Google.
  if (prefix === "can") {
    return `CAN-${id.number}`;
  }
  // コイン PLUS prints `COIN-1` … `COIN-16`.
  if (prefix === "coin") {
    return `COIN-${id.number}`;
  }
  const width = id.number >= 1000 ? 4 : 3;
  const digits = String(id.number).padStart(width, "0");
  const us = CCG_US_PRINTED[prefix];
  if (us) return `${us}${digits}`;
  if (prefix === "prus") return `PR-US${digits}`;
  const ref = `${prefix.toUpperCase()}-${digits}`;
  if (!grouping) return ref;
  if (grouping.toLowerCase() === "promo") return `${ref} · promo`;
  if (grouping.toLowerCase() === "prerelease") return `${ref} · prerelease`;
  return `${ref}-${grouping}`;
}

export function compareNarutoLangs(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const left = (a ?? "").toLowerCase();
  const right = (b ?? "").toLowerCase();
  const ia = LANG_ORDER.indexOf(left as (typeof LANG_ORDER)[number]);
  const ib = LANG_ORDER.indexOf(right as (typeof LANG_ORDER)[number]);
  const oa = ia === -1 ? LANG_ORDER.length : ia;
  const ob = ib === -1 ? LANG_ORDER.length : ib;
  if (oa !== ob) return oa - ob;
  return left.localeCompare(right);
}

export function narutoCollectorsMatch(a: string, b: string): boolean {
  const ka = narutoCollectorKey(a);
  const kb = narutoCollectorKey(b);
  return ka != null && ka === kb;
}

function narutoNumerationLane(prefix: string): number {
  if (CCG_US_DISK_PREFIXES.has(prefix)) return 1;
  if (ALT_LINE_DISK_PREFIXES.has(prefix)) return 2;
  return 0;
}

/** CdF / shuriken reprint of a retail number — not a dedicated `PR-nn`. */
function isTourneyPromoReprint(id: NarutoCollectorId): boolean {
  const grouping = id.grouping?.toLowerCase();
  return grouping === "promo" || grouping === "cdf";
}

/**
 * A print that belongs on the promo checklist: dedicated `PR-nn` / `OP忍`,
 * tourney `-promo` / `-cdf`, or the JP PS1 bonuses filed as promo.
 * A booster `NI-063` that leaked `promo` into `print_sets` is not one.
 */
export function isNarutoPromoSetMember(raw: string): boolean {
  const id = parseNarutoCollector(raw);
  if (!id) return false;
  if (id.family === "promo") return true;
  const grouping = id.grouping?.toLowerCase();
  if (grouping === "ps") return true;
  return isTourneyPromoReprint(id);
}

/**
 * Binder bucket. A `-promo` / `-cdf` reprint keeps its printed family for
 * identity, but files after knights with the PR sequences so `NI-063` is
 * not followed by `NI-063 · promo` in the series checklist.
 */
function collectorSortFamily(id: NarutoCollectorId): NarutoCollectorFamily {
  if (isTourneyPromoReprint(id)) return "promo";
  return id.family;
}

export function compareNarutoCollectors(a: string, b: string): number {
  const ia = parseNarutoCollector(a);
  const ib = parseNarutoCollector(b);
  if (!ia && !ib) return a.localeCompare(b);
  if (!ia) return 1;
  if (!ib) return -1;
  const fa = FAMILY_ORDER.indexOf(collectorSortFamily(ia));
  const fb = FAMILY_ORDER.indexOf(collectorSortFamily(ib));
  if (fa !== fb) return fa - fb;
  const subFa = FAMILY_ORDER.indexOf(ia.family);
  const subFb = FAMILY_ORDER.indexOf(ib.family);
  if (subFa !== subFb) return subFa - subFb;
  const pa = canonicalNarutoDiskPrefix(ia.printedPrefix);
  const pb = canonicalNarutoDiskPrefix(ib.printedPrefix);
  const la = narutoNumerationLane(pa);
  const lb = narutoNumerationLane(pb);
  if (la !== lb) return la - lb;
  if (ia.number !== ib.number) return ia.number - ib.number;
  if (pa !== pb) {
    const iax = DISK_PREFIX_ORDER.indexOf(
      pa as (typeof DISK_PREFIX_ORDER)[number],
    );
    const ibx = DISK_PREFIX_ORDER.indexOf(
      pb as (typeof DISK_PREFIX_ORDER)[number],
    );
    const oa = iax === -1 ? DISK_PREFIX_ORDER.length : iax;
    const ob = ibx === -1 ? DISK_PREFIX_ORDER.length : ibx;
    if (oa !== ob) return oa - ob;
    return pa.localeCompare(pb);
  }
  return (ia.grouping ?? "").localeCompare(ib.grouping ?? "");
}

const SERIES_SET = /^(s\d+|promo|prerelease|ns|spc|maki\d+|maku\d+)$/i;

/** `ni001` → `naruto:ni-0001`. Distinct from `naruto:n-0001`. */
export function mintNarutoPrintKey(
  raw: string,
  appearanceSet?: string | null,
): string | null {
  const id = parseNarutoCollector(raw);
  if (!id) return null;
  return buildPrintKey({
    game: "naruto",
    set: canonicalNarutoDiskPrefix(id.printedPrefix),
    number: paddedNumber(id),
    grouping: narutoAppearanceGrouping(id, appearanceSet),
  });
}

/**
 * Old keys baked the series (`naruto:s1-ni001`). New keys are the printed
 * prefix (`naruto:ni-0001`). `naruto:promo-ni023` → `naruto:ni-0023-promo`.
 * Already-new keys pass through.
 */
export function canonicalizeNarutoPrintKey(key: string): string {
  const parsed = parsePrintKey(key);
  if (!parsed || parsed.game !== "naruto") return key;
  if (SERIES_SET.test(parsed.set)) {
    const raw = parsed.grouping
      ? `${parsed.number}-${parsed.grouping}`
      : parsed.number;
    return mintNarutoPrintKey(raw, parsed.set) ?? key;
  }
  const raw = parsed.grouping
    ? `${parsed.set}${parsed.number}-${parsed.grouping}`
    : `${parsed.set}${parsed.number}`;
  return mintNarutoPrintKey(raw) ?? key;
}

export function isNarutoSeriesSetCode(set: string): boolean {
  return SERIES_SET.test(set.trim());
}

/** Ledger / checklist form: `ni232`, `n1650` (3-pad under 1000). */
export function narutoLedgerNumber(raw: string): string | null {
  const id = parseNarutoCollector(raw);
  if (!id) return null;
  const prefix = canonicalNarutoDiskPrefix(id.printedPrefix);
  const width = id.number >= 1000 ? 4 : 3;
  const n = String(id.number).padStart(width, "0");
  return id.grouping ? `${prefix}${n}-${id.grouping}` : `${prefix}${n}`;
}

export function narutoNumbersEqual(a: string, b: string): boolean {
  const left = narutoDiskCardId(a);
  const right = narutoDiskCardId(b);
  return left != null && left === right;
}


// --- shared leaf type (owned by identity; search re-exports) ---

export type NarutoPrintDetail = {
  printKey: string;
  setCode: string;
  number: string;
  cardType: string | null;
  /** Null when `LEFT JOIN print_titles` finds no locale yet. */
  lang: string | null;
  fullName: string | null;
  rarity: string | null;
  art: string | null;
  thumb: string | null;
  printed?: boolean | null;
  /**
   * Numéro pour le chemin disque quand `art` est emprunté à un jumeau retail
   * (`te0034-promo` → face de `te0034`). Absent = utiliser `number`.
   */
  artNumber?: string | null;
};

// --- from facts.ts ---

/**
 * Item facts for a Naruto CCG print.
 *
 * `kind` is `category`, never `tag`: the item page remaps `tag` (and `genre`)
 * to a single "Thèmes" label, which is right for board-game families but wipes
 * a card attribute's own name — Rareté, Distribution and Langue all rendered as
 * three groups called "Thèmes".
 *
 * The pack is a closed local corpus, so everything here is read from
 * `catalog.sqlite` plus the curated ledgers — no network, no guessing. What the
 * catalogue does not hold (chakra cost, power, printed effect text) is simply
 * not emitted: the faces are scans, never a structured card database, and
 * inventing values would be worse than a shorter table.
 */



/** Card families, as carddass.fr filed them (`cartes/5/ninjas/`, `tactique/`…). */
const CARD_FAMILY: Record<string, string> = {
  ni: "Ninja",
  ta: "Tactique",
  te: "Technique",
  cl: "Client",
  ki: "Chevalier",
  pr: "Promo",
  n: "Ninja",
  j: "Jutsu",
  m: "Mission",
  st: "Tactique",
  c: "Client",
  shi: "Ninja",
  mju: "Jutsu",
  msa: "Tactique",
  prni: "Promo",
  prte: "Promo",
  prta: "Promo",
  prcl: "Promo",
  prki: "Promo",
  opni: "Promo",
  gaku: "Ninja",
};

type SetsFile = {
  sets?: Record<
    string,
    {
      series?: number | null;
      starters?: string[];
      released?: boolean;
      /** Official expansion title when Bandai named the set (EN CCG s28…). */
      title?: string | null;
      /** EN CCG series that shares s1–s6 with Carddass FR. */
      enCcgTitle?: string | null;
      /** Italian retail series title (CardGameClub / Primegame s1–s8). */
      itTitle?: string | null;
      /** When set, the checklist uses this instead of measuring titles. */
      printedLanguages?: string[];
      languages?: string[];
    }
  >;
};

let setsCache: SetsFile | null = null;

function loadSets(): SetsFile {
  if (setsCache) return setsCache;
  try {
    setsCache = JSON.parse(
      readFileSync(path.join(narutoCuratedSourcesDir(), "sets.json"), "utf8"),
    ) as SetsFile;
  } catch {
    setsCache = {};
  }
  return setsCache;
}

/**
 * `s5` → `Série 5 — La quête / Un nouveau départ`. Bandai never titled its
 * series; the two starter names are what a collector actually recognises, so
 * both are shown rather than the collector-convention single label.
 * EN CCG Series 1 shares `s1` with Carddass — pass the printed id (`n001`).
 */
/**
 * Les sets que le registre déclare **jamais sortis en français**.
 *
 * La Série 6 est le cas : annoncée pour avril 2008, repoussée, puis annulée —
 * Carddass s'est reporté sur Dragon Ball. Les cartes existent, mais imprimées
 * **en Italie** (« Serie 6 — Rivalità Eterna »), et les entrées françaises du
 * catalogue sont des rendus de pré-production trouvés sur `carddass.fr`, pas
 * des cartes physiques.
 *
 * Mesurer les langues sur ces titres faisait donc apparaître la Série 6 sous
 * « français », pour des cartes qu'on ne peut pas posséder. Le fait curé prime
 * sur la mesure : ce que le registre sait, la statistique ne le devine pas.
 */
export function narutoSetsUnreleasedInFrench(): Set<string> {
  const entries = loadSets().sets ?? {};
  return new Set(
    Object.entries(entries)
      .filter(([, entry]) => entry?.released === false)
      .map(([code]) => code.toLowerCase()),
  );
}

/** Langues de sortie curées — le deck Tempête n'est pas l'Approaching Wind EN. */
export function narutoSetShippedLanguages(setCode: string): string[] | null {
  const entry = loadSets().sets?.[setCode.trim().toLowerCase()];
  const langs = entry?.printedLanguages ?? entry?.languages;
  if (!langs?.length) return null;
  return langs.map((code) => code.trim().toLowerCase()).filter(Boolean);
}

/** Drop the FR collector prefix on titles that are already English (s24 / s28). */
function englishSetTitle(title: string): string {
  const stripped = title.replace(/^Série\s+\d+\s+[—–-]\s+/i, "").trim();
  return stripped || title;
}

function withNumberedSeries(
  series: number | null | undefined,
  name: string,
  word: "Series" | "Serie",
): string {
  if (series == null) return name;
  return `${word} ${series} — ${name}`;
}

/**
 * Libellé d'extension pour la fiche / la check-list.
 *
 * `language` = langue UI de la check-list (ou langue du tirage sur la fiche).
 * EN → titres Bandai USA ; IT → titres retail italiens (s1–s8) ; FR → starters.
 */
export function narutoSetLabel(
  setCode: string,
  card?: string | null,
  language?: string | null,
): string {
  const code = setCode.toLowerCase();
  const lang = language?.trim().toLowerCase() || "";
  if (code === "promo") {
    if (lang === "en") return "Promo (off-series)";
    if (lang === "it") return "Promo (fuori serie)";
    return "Promo (hors série)";
  }
  if (code === "prerelease") {
    if (lang === "en") return "Prerelease (manga)";
    if (lang === "it") return "Prerelease (manga)";
    return "Prerelease (manga)";
  }
  if (code === "prerelease") {
    if (lang === "en") return "Prerelease (manga)";
    if (lang === "it") return "Prerelease (manga)";
    return "Prerelease (manga)";
  }
  const entry = loadSets().sets?.[code];
  const cardIsEnCcg =
    Boolean(card) &&
    narutoCatalogueLineForCard(card!, setCode) === "en-ccg";
  const preferEnTitle = lang === "en" || cardIsEnCcg;
  if (preferEnTitle && entry?.enCcgTitle?.trim()) {
    return withNumberedSeries(entry.series, entry.enCcgTitle.trim(), "Series");
  }
  if (lang === "it" && entry?.itTitle?.trim()) {
    return withNumberedSeries(entry.series, entry.itTitle.trim(), "Serie");
  }
  if (entry?.title?.trim()) {
    const title = entry.title.trim();
    if (lang === "en") {
      return withNumberedSeries(entry.series, englishSetTitle(title), "Series");
    }
    if (lang === "it") {
      return withNumberedSeries(entry.series, englishSetTitle(title), "Serie");
    }
    return title;
  }
  if (!entry?.series) return setCode.toUpperCase();
  if (lang === "en") {
    const cancelled = entry.released === false ? " (cancelled)" : "";
    return `Series ${entry.series}${cancelled}`;
  }
  if (lang === "it") {
    const cancelled = entry.released === false ? " (annullata)" : "";
    return `Serie ${entry.series}${cancelled}`;
  }
  const starters = (entry.starters ?? []).filter(Boolean);
  const base = `Série ${entry.series}`;
  const suffix = starters.length ? ` — ${starters.join(" / ")}` : "";
  const cancelled = entry.released === false ? " (annulée)" : "";
  return `${base}${suffix}${cancelled}`;
}

/** Promo distribution channels, as the curated ledger records them. */
const PROMO_CHANNEL_LABEL: Record<string, string> = {
  tin: "Tin box (coffret)",
  tournament: "Tournoi",
  "tournament-s5-example": "Tournoi",
  "cdf-champion-2007": "Coupe de France 2007 — champion",
  "cdf-top8-2007": "Coupe de France 2007 — top 8",
  "cdf-participants-2007": "Coupe de France 2007 — participants",
  "avant-premiere-s4": "Avant-première Série 4",
  "league-vacances-konoha": "Ligue « Vacances à Konoha »",
  "upcoming-2007": "Annonce 2007",
};

/** 1★ participation / 2★ top 5 / 3★ vainqueur — le stamp shuriken dit le palier. */
function tournamentTierLabel(
  channel: string,
  shuriken: number | null | undefined,
): string | null {
  // CdF / tin : garder le canal dédié (pas « Tournoi — … » générique).
  if (channel.startsWith("cdf-") || channel === "tin") return null;
  if (shuriken === 1) return "Tournoi — participation";
  if (shuriken === 2) return "Tournoi — top 5";
  if (shuriken === 3) return "Tournoi — vainqueur";
  const base = PROMO_CHANNEL_LABEL[channel];
  if (base?.startsWith("Tournoi") || channel === "tournament") return base ?? null;
  return null;
}

function promoFacts(number: string, providerId: string): MetadataFact[] {
  let row;
  try {
    row = loadAttestedPromos().find(
      (p) =>
        p.number === number ||
        narutoNumbersEqual(p.number, number) ||
        (p.diskCardId != null && narutoNumbersEqual(p.diskCardId, number)),
    );
  } catch {
    return [];
  }
  if (!row) return [];
  const out: MetadataFact[] = [];
  const channel = row.channel
    ? (tournamentTierLabel(row.channel, row.shuriken) ??
      PROMO_CHANNEL_LABEL[row.channel] ??
      row.channel)
    : null;
  if (channel) {
    out.push({
      kind: "category",
      label: "Distribution",
      value: channel,
      source: providerId,
      confidence: 0.85,
      priority: 34,
    });
  }
  if (typeof row.shuriken === "number" && row.shuriken > 0) {
    out.push({
      kind: "category",
      // The printed PROMO stamp carries 1–3 shurikens; more = scarcer.
      label: "Shurikens",
      value: "★".repeat(row.shuriken),
      source: providerId,
      confidence: 0.85,
      priority: 32,
    });
  }
  return out;
}

export function narutoPrintFacts(
  row: NarutoPrintDetail,
  providerId: string,
): MetadataFact[] {
  const facts: MetadataFact[] = [
    {
      // `format`, not `identifier`: identifiers are hidden from the detail
      // table, and the printed number is the first thing a collector reads.
      kind: "format",
      label: "Numéro",
      value: formatNarutoReference(row.setCode, row.number, row.lang),
      source: providerId,
      confidence: 0.95,
      priority: 45,
    },
    {
      kind: "series",
      label: "Extension",
      value: narutoSetLabel(row.setCode, row.number, row.lang),
      source: providerId,
      confidence: 0.9,
      priority: 36,
    },
  ];

  if (row.rarity) {
    facts.push({
      kind: "category",
      label: "Rareté",
      value: row.rarity,
      source: providerId,
      confidence: 0.9,
      priority: 40,
    });
  }

  const code = row.cardType?.toLowerCase() ?? "";
  // `pr` is not a card family — the promo line reuses Ninja / Tactique /
  // Technique art. Emitting it here would just repeat the rarity.
  const family =
    code && code !== "pr" ? (CARD_FAMILY[code] ?? row.cardType) : null;
  if (family) {
    facts.push({
      kind: "category",
      label: "Type",
      value: family,
      source: providerId,
      confidence: 0.9,
      priority: 26,
    });
  }

  if (row.lang) {
    facts.push({
      kind: "category",
      label: "Langue",
      value: row.lang.toUpperCase(),
      source: providerId,
      confidence: 0.9,
      priority: 18,
    });
  }

  if (row.setCode.toLowerCase() === "promo") {
    facts.push(...promoFacts(row.number, providerId));
  } else if (
    parseNarutoCollector(row.number)?.grouping?.toLowerCase() === "prerelease"
  ) {
    facts.push({
      kind: "category",
      label: "Distribution",
      value: "Avant-première manga",
      source: providerId,
      confidence: 0.85,
      priority: 34,
    });
  }

  const quote = narutoIndicativeQuoteForPrint({
    setCode: row.setCode,
    number: row.number,
    rarity: row.rarity,
  });
  if (quote) {
    facts.push({
      kind: "price",
      label: "Estimation",
      value: quote.displayValue,
      source: NARUTO_INDICATIVE_PRICE_SOURCE,
      url: quote.sourceUrl,
      confidence: 0.35,
      priority: 48,
    });
  }

  return facts;
}

// --- from appearanceSets.ts ---

/**
 * Valeurs d'`appearances.json` : une série, ou plusieurs quand la checklist
 * papier (ou le disque) place la même carte dans plusieurs extensions.
 */

export type NarutoAppearanceValue = string | readonly string[];

export type NarutoLangAppearances = Record<string, NarutoAppearanceValue>;

/** Normalise `s5` | `["s1","s5"]` → liste unique triée. */
export function appearanceSetsOf(
  value: NarutoAppearanceValue | null | undefined,
): string[] {
  if (value == null) return [];
  const raw = Array.isArray(value) ? value : [value];
  const out = new Set<string>();
  for (const row of raw) {
    const set = String(row ?? "")
      .trim()
      .toLowerCase();
    if (set && set !== "unknown") out.add(set);
  }
  return [...out].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

export function mergeAppearanceValues(
  ...values: Array<NarutoAppearanceValue | null | undefined>
): string[] {
  const out = new Set<string>();
  for (const value of values) {
    for (const set of appearanceSetsOf(value)) out.add(set);
  }
  return [...out].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

/**
 * Série « primaire » pour `prints.set_code` / libellé lookup.
 * Préfère la plus petite série FR (s1 avant s5) ; évite unknown et les 巻ノ
 * (autre découpe, hors membership européenne).
 */
export function primaryAppearanceSet(
  sets: readonly string[],
  fallback = "unknown",
): string {
  const clean = appearanceSetsOf([...sets]);
  if (clean.length === 0) return fallback;
  const retail = clean.filter((set) => /^s[1-5]$/.test(set));
  if (retail.length) return retail[0]!;
  /*
    EN CCG tin exclusives (N-US…) live on disk as one folder shared by retail
    s6 and a tourney `-promo` stamp. Prefer s6 so `buildIndexFromDisk` attaches
    `art.*` to `naruto:nus-####` — catalogue fallback then paints the promo stub.
  */
  if (clean.includes("s6")) return "s6";
  const nonVolume = clean.filter(
    (set) => set !== "s6" && !/^maki\d+$/i.test(set),
  );
  if (nonVolume.length) return nonVolume[0]!;
  const nonS6 = clean.filter((set) => set !== "s6");
  return nonS6[0] ?? clean[0]!;
}

/** Valeur à persister dans appearances.json (scalaire si une seule série). */
export function appearanceValueForJson(
  sets: readonly string[],
): NarutoAppearanceValue {
  const clean = appearanceSetsOf([...sets]);
  if (clean.length <= 1) return clean[0] ?? "unknown";
  return clean;
}


/**
 * Si une langue a réellement été **imprimée sur carton** pour ce set.
 *
 * La Série 6 française fut annoncée puis annulée : les entrées françaises du
 * catalogue sont des rendus de pré-production trouvés sur `carddass.fr`, pas
 * des cartes qu'on peut tenir. Les italiennes, elles, existent — le set a été
 * imprimé en Italie.
 *
 * **Le fait se lit dans le registre**, où il était déjà écrit (`released:
 * false` + la note `cancelled`). Il était en plus codé en dur ici, et je m'
 * apprêtais à l'écrire une troisième fois pour le filtre de langue : trois
 * copies d'une même chose, dont deux se seraient tues le jour où un autre set
 * subirait le même sort.
 *
 * Plusieurs séries (checklist papier) : imprimée dès qu’**une** série l’est.
 */
export function isNarutoLangPrinted(
  appearanceSet: NarutoAppearanceValue | null | undefined,
  lang: string,
): boolean {
  const code = lang?.trim().toLowerCase();
  if (code !== "fr" && code !== "fra") return true;
  const sets = appearanceSetsOf(appearanceSet);
  if (sets.length === 0) return true;
  const blocked = narutoSetsUnreleasedInFrench();
  return sets.some((set) => !blocked.has(set));
}

/**
 * One print, several locales: keep the retail appearance. An Italian S6 face
 * on the same NI number must not mark the French S2/S3 slot unprinted.
 */
export function preferNarutoAppearanceSet(
  current: string | null | undefined,
  next: string,
): string {
  const a = (current ?? "").trim().toLowerCase();
  const b = next.trim().toLowerCase();
  if (!a || a === "unknown") return b || "unknown";
  if (!b || b === "unknown") return a;
  if (a === "s6" && b !== "s6") return b;
  return a;
}

// --- from officialNames.ts ---

/**
 * Official FR card names, from
 * `src/providers/naruto/narutocarddass/curated/sources/carddass-card-names.json`.
 *
 * They take precedence over the Manga-News cache, which is a community
 * checklist that truncates long names at ~24 characters ("Pouvoir de la marque
 * mal…") and carries a few misreadings. The official file merges carddass.fr's
 * own "liste des cartes" pages with the transcribed printed checklists, and
 * arbitrates the divergences case by case.
 *
 * It is not blindly authoritative either: the printed checklist prints
 * "Temari" where card NI-150 reads SAKON, so a handful of entries are resolved
 * against the card itself. See `printedChecklistErrata` in the source file.
 *
 * Manga-News still fills what the official sources never named — most of
 * Série 06 (cancelled FR) and the promos, for which no checklist has ever
 * existed. A handful of S6 names are attested from carddass.fr pre-prod art.
 */


type OfficialCard = {
  name: string;
  rarity?: string | null;
  serie?: number | null;
  source?: string;
};

export type OfficialNames = Map<string, OfficialCard>;

function sourcesFile(): string {
  return path.join(narutoCuratedSourcesDir(), "carddass-card-names.json");
}

/** Keyed by collector number (`ni232`). Empty when the file is absent. */
export function loadOfficialNames(): OfficialNames {
  const file = sourcesFile();
  if (!existsSync(file)) return new Map();
  const doc = JSON.parse(readFileSync(file, "utf8")) as {
    cards?: Record<string, OfficialCard>;
  };
  return new Map(Object.entries(doc.cards ?? {}));
}

/**
 * Suffixes qui désignent une **autre carte**, pas une réimpression.
 *
 * Le bonus de précommande du jeu PlayStation « 忍の里の陣取り合戦 » (2003) porte
 * les numéros 忍-1/2/3/11 avec une **illustration inédite** — la page de Bandai
 * dit `書き下ろしイラスト`, et notre registre le note explicitement
 * `not: ["reimpression-de-忍-1"]`. Ces quatre cartes ne sont jamais sorties
 * hors du Japon.
 *
 * Le nom officiel se cherche par numéro, suffixe retiré. Pour un `-promo` c'est
 * juste : un retirage marqué PROMO est bien la même carte. Pour `-ps` / `-a` /
 * `-b` c'est faux : illustration ou feuille JP distincte, jamais sortie en FR —
 * et ça leur collait le nom **français** de la carte de base (« Les mille
 * oiseaux » sur TE-259-b, etc.).
 */
const NEW_ARTWORK_GROUPINGS = new Set(["ps", "a", "b"]);

/**
 * `naruto:s5-ni232` → `ni232`, suffixe retiré pour aller chercher le nom
 * officiel de la carte de base.
 *
 * Rend `null` quand le suffixe dit qu'il ne **s'agit pas** de cette carte :
 * l'appelant n'a alors rien à chercher, plutôt qu'un nom emprunté.
 */
export function collectorNumberOf(print: NarutoPrintRow): string | null {
  const raw =
    narutoLedgerNumber(print.number) ?? String(print.number).toLowerCase();
  const grouping = /-([a-z0-9]+)$/i.exec(raw)?.[1]?.toLowerCase();
  if (grouping && NEW_ARTWORK_GROUPINGS.has(grouping)) return null;
  return raw.replace(/-.*$/, "").toLowerCase();
}

/**
 * Overlay official names on top of whatever the community cache produced.
 * A community title is kept only when no official name exists for that number.
 */
export function applyOfficialNames(
  prints: readonly NarutoPrintRow[],
  titles: readonly NarutoTitleRow[],
  official: OfficialNames,
): { titles: NarutoTitleRow[]; replaced: number; added: number } {
  const byKey = new Map(
    titles.map((t) => [`${t.printKey}|${t.lang}`, { ...t }]),
  );
  let replaced = 0;
  let added = 0;

  for (const print of prints) {
    /*
      `null` = ce tirage n'est pas la carte de base, malgré le numéro partagé.
      Rien à emprunter : sans ça, les quatre 忍-n（PS） recevaient le nom
      français de la carte qu'elles ne sont pas.
    */
    const number = collectorNumberOf(print);
    if (!number) continue;
    const hit = official.get(number);
    if (!hit?.name) continue;
    const key = `${print.printKey}|fr`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, {
        printKey: print.printKey,
        lang: "fr",
        fullName: hit.name,
        rarity: hit.rarity ?? null,
      });
      added += 1;
      continue;
    }
    if (prev.fullName !== hit.name) {
      prev.fullName = hit.name;
      replaced += 1;
    }
    if (!prev.rarity && hit.rarity) prev.rarity = hit.rarity;
  }

  return { titles: [...byKey.values()], replaced, added };
}


export type NarutoAppearancesFile = {
  generatedAt: string;
  appearances: Record<string, NarutoLangAppearances>;
};

// --- from officialFrChecklist.ts ---

/**
 * Checklist papier Bandai FR S1–S5 → appartenances multi-séries sur le disque.
 *
 * Source : `curated/sources/carddass-fr-checklist.json`.
 * Cible : `data/…/appearances.json` (plusieurs sets par langue quand Bandai
 * liste le même numéro dans plusieurs séries).
 */


type ChecklistFile = {
  sets?: Record<string, { ids?: readonly string[] }>;
};

let numbersBySet: Map<string, string[]> | null = null;

function checklistPath(): string {
  return path.join(narutoCuratedSourcesDir(), "carddass-fr-checklist.json");
}

/** Formes possibles de `prints.number` / disk id pour un id checklist. */
export function checklistIdToNumberForms(id: string): string[] {
  const raw = id.trim().toLowerCase();
  const m = /^(ni|te|ta|cl|pr)(\d+)$/i.exec(raw);
  if (!m) return raw ? [raw] : [];
  const type = m[1]!.toLowerCase();
  const n = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(n) || n < 0) return [raw];
  return [
    ...new Set([
      `${type}${n}`,
      `${type}${String(n).padStart(3, "0")}`,
      `${type}${String(n).padStart(4, "0")}`,
    ]),
  ];
}

function loadChecklistSetsById(): Map<string, string[]> {
  const byId = new Map<string, string[]>();
  const file = checklistPath();
  if (!existsSync(file)) return byId;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as ChecklistFile;
    for (const [setId, body] of Object.entries(parsed.sets ?? {})) {
      const sid = setId.trim().toLowerCase();
      if (!/^s[1-5]$/.test(sid)) continue;
      for (const id of body.ids ?? []) {
        const key = id.trim().toLowerCase();
        if (!key) continue;
        const sets = byId.get(key) ?? [];
        if (!sets.includes(sid)) sets.push(sid);
        byId.set(key, sets);
      }
    }
  } catch {
    /* ignore */
  }
  return byId;
}

function loadNumbersBySet(): Map<string, string[]> {
  if (numbersBySet) return numbersBySet;
  const out = new Map<string, string[]>();
  for (const [id, sets] of loadChecklistSetsById()) {
    for (const setId of sets) {
      const forms = out.get(setId) ?? [];
      for (const form of checklistIdToNumberForms(id)) {
        if (!forms.includes(form)) forms.push(form);
      }
      out.set(setId, forms);
    }
  }
  numbersBySet = out;
  return out;
}

export function resetOfficialFrChecklistCache(): void {
  numbersBySet = null;
}

export function officialFrChecklistDiskNumbers(setId: string): string[] {
  return loadNumbersBySet().get(setId.trim().toLowerCase()) ?? [];
}

export function officialFrChecklistSetsForNumber(number: string): string[] {
  const forms = new Set(checklistIdToNumberForms(number));
  const hits: string[] = [];
  for (const [setId, nums] of loadNumbersBySet()) {
    if (nums.some((n) => forms.has(n))) hits.push(setId);
  }
  return hits.sort();
}

/**
 * Fusionne la checklist papier dans `appearances.json` du pack.
 * @returns nombre de cartes FR dont la liste de sets a changé.
 */
export function syncOfficialFrChecklistAppearances(packRoot: string): number {
  const file = path.join(packRoot, "appearances.json");
  let appearances: Record<
    string,
    Record<string, string | readonly string[]>
  > = {};
  let generatedAt = new Date().toISOString();
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as NarutoAppearancesFile;
      appearances = { ...(raw.appearances ?? {}) };
      generatedAt = raw.generatedAt ?? generatedAt;
    } catch {
      /* rebuild */
    }
  }

  let changed = 0;
  for (const [checklistId, sets] of loadChecklistSetsById()) {
    const diskId =
      narutoDiskCardId(checklistId) ??
      checklistIdToNumberForms(checklistId).find((form) =>
        /^[a-z]+\d{4}/.test(form),
      ) ??
      checklistIdToNumberForms(checklistId)[0];
    if (!diskId) continue;
    const langs = appearances[diskId] ?? {};
    const before = appearanceSetsOf(langs.fr).join(",");
    const merged = mergeAppearanceValues(langs.fr, sets);
    if (merged.length === 0) continue;
    langs.fr = appearanceValueForJson(merged);
    appearances[diskId] = langs;
    if (appearanceSetsOf(langs.fr).join(",") !== before) changed += 1;
  }

  writeFileSync(
    file,
    `${JSON.stringify(
      {
        generatedAt,
        appearances,
      } satisfies NarutoAppearancesFile,
      null,
      2,
    )}\n`,
  );
  return changed;
}


/** Derived ledger path — shared with pipeline/coverage. */
export function apacheIndexPath(): string {
  return path.join(dataRoot(), NARUTO_PACK_ID, "logs", "apache-index.json");
}

// --- from knownCards.ts ---

/**
 * Naruto CACG FR — "what cards are known to exist", from every source we hold.
 *
 * The catalogue is built from the images we managed to download, so it can only
 * ever list cards we already have. This ledger inverts that: it collects every
 * card number attested by *any* source, so a card the scrape never saw still
 * shows up — with the reason we believe it exists.
 *
 * Sources (`src/providers/naruto/narutocarddass/curated/sources/`, hand-assembled once from
 * Wayback / PDF / community — not replayable by the scrape CLI):
 * - `carddass-fr-checklist` — the printed S1–S5 checklists (PDF). Authoritative
 *   list + official FR names. No such checklist exists for S6 or promos.
 * - `apache-index`       — carddass.fr autoindex listings (`logs/apache-index.json`,
 *   regenerable via `--only sources`): files that EXISTED on the server,
 *   including ones Wayback never downloaded.
 * - `carddass-html`      — image references parsed from archived site pages.
 * - `manga-news`         — community checklist (`logs/coverage.json`).
 * - `coleka`             — collector database; the only index that covers
 *   Série 06 at all, and the only one listing the six 2008-imprint cards.
 * - `local-index`        — what we actually have on disk.
 *
 *   Catalogue Sync --only known
 */



/**
 * Non-replayable Naruto ledgers / faces live under `curated/` (git).
 * Recoverable scrape output stays under `data/naruto/carddass/`.
 */

const PROVIDER_DIR = path.dirname(fileURLToPath(import.meta.url));

export function narutoCuratedDir(): string {
  return path.join(PROVIDER_DIR, "curated");
}

/**
 * Visuels de produit faits à la main : badges de série découpés, logo du jeu,
 * emballages photographiés, et les retouches d'un visuel qu'une source sert
 * mal cadré.
 *
 * Ils vivent ici et **pas dans `staging/`** : le staging se reconstruit par
 * script depuis un relevé, donc tout ce qu'on y pose à la main disparaît à la
 * prochaine moisson, sans bruit.
 */
export function narutoCuratedProductsDir(): string {
  return path.join(narutoCuratedDir(), "products");
}

export function narutoCuratedSourcesDir(): string {
  return path.join(narutoCuratedDir(), "sources");
}

export function narutoCuratedReconstructedProvenancePath(): string {
  return path.join(narutoCuratedSourcesDir(), "reconstructed-provenance.json");
}


export const KNOWN_SOURCES = [
  "carddass-fr-checklist",
  "apache-index",
  "carddass-html",
  "manga-news",
  "coleka",
  "local-index",
] as const;

export type KnownSource = (typeof KNOWN_SOURCES)[number];

export type KnownCardRow = {
  number: string;
  type: MangaNewsCardType;
  sources: KnownSource[];
  /** Official FR name from the printed checklist, when it parsed cleanly. */
  officialName?: string;
  /** Sets the official checklist places this number in (s1…s5). */
  officialSets: string[];
  /** Sets we hold art for. */
  localSets: string[];
  hasArt: boolean;
};

/**
 * Série 06 was announced for 2009, postponed, then cancelled — Carddass moved
 * its effort to Dragon Ball. Its cards were previewed weekly on carddass.fr but
 * never printed, which is why no collector database holds a photo of a single
 * one (Coleka lists 48 and has 0 images), and why the site never produced a S6
 * booster packshot, logo or starter while S1–S5 all have theirs.
 *
 * They are therefore not gaps in the catalogue — they are a product that does
 * not exist — and the pack only tracks physical cards. Counted separately.
 *
 * Membership is read from the data, never from a list of card numbers: the
 * carddass.fr reference path (`images/cartes/6/…`), Coleka's Série 06 branch,
 * or the `s6` set on disk.
 */
const SERIE_06_PATH = /\/cartes\/0?6\//i;
const SERIE_06_SET = "s6";

export type SetInfo = {
  series: number | null;
  /** Bandai named two starters per series, never the series itself. */
  starters: string[];
  /** Coleka's label — a collector convention, not an official title. */
  colekaLabel: string | null;
  released?: boolean;
};

export type KnownCardsReport = {
  generatedAt: string;
  sets: Record<string, SetInfo>;
  counts: Record<KnownSource, number>;
  total: number;
  /** Printed (or otherwise physically attested) card with no image — real gap. */
  missingArt: string[];
  /**
   * Never published on paper — still kept in the ledger (names / numbers /
   * refs). Includes cancelled Série 06 and lone site HTML refs (e.g. `ta090`).
   */
  unreleased: string[];
  /** Subset of `unreleased`: only attested by a `carddass-html` href. */
  unreleasedHtmlOnly: string[];
  /** In the local index but attested by no external source (promos, S6 on disk). */
  unattested: string[];
  /**
   * Local face is a large collector photo (no carddass site render /
   * corrected / reconstructed preferred). OK as fallback — queue for
   * `art.reconstructed.webp`.
   */
  photoFallbackArt: PhotoFallbackArtRow[];
  cards: KnownCardRow[];
};

/** Official site faces cluster ~40–80 KB / ~350×495; photos are far larger. */
export const PHOTO_FALLBACK_MIN_BYTES = 300_000;

export type PhotoFallbackArtRow = {
  printKey: string;
  set: string;
  cardId: string;
  /** Displayed face filename under the card dir. */
  artFile: string;
  bytes: number;
  /** `high` = published set gap; `low` = cancelled S6 photos. */
  priority: "high" | "low";
};

/**
 * Preferred face is plain `art.*` and oversized → collector-photo fallback
 * (not `art.corrected` / `art.reconstructed`).
 */
export function isCollectorPhotoFallbackFace(input: {
  preferredArtFile: string | null;
  bytes: number;
  minBytes?: number;
}): boolean {
  const file = input.preferredArtFile;
  if (!file) return false;
  if (!/^art\.(jpe?g|png|webp|gif)$/i.test(file)) return false;
  return input.bytes >= (input.minBytes ?? PHOTO_FALLBACK_MIN_BYTES);
}

/** Scan card folders for photo-fallback faces still preferred. */
export function collectPhotoFallbackArt(
  cardsRoot: string,
): PhotoFallbackArtRow[] {
  if (!existsSync(cardsRoot)) return [];
  const rows: PhotoFallbackArtRow[] = [];
  for (const hit of listNarutoCardDirs(cardsRoot)) {
    if (hit.lang !== "fr") continue;
    const files = readdirSync(hit.abs);
    const preferred = pickPreferredFaceArtFilename(files, "fr");
    if (!preferred) continue;
    const artPath = path.join(hit.abs, preferred);
    let bytes = 0;
    try {
      bytes = statSync(artPath).size;
    } catch {
      continue;
    }
    if (!isCollectorPhotoFallbackFace({ preferredArtFile: preferred, bytes })) {
      continue;
    }
    const appearance = hit.appearanceSet ?? hit.family;
    rows.push({
      printKey:
        mintNarutoPrintKey(hit.diskId, hit.appearanceSet) ??
        `naruto:${appearance}-${hit.diskId}`,
      set: appearance,
      cardId: hit.diskId,
      artFile: preferred,
      bytes,
      priority: appearance === "s6" ? "low" : "high",
    });
  }
  rows.sort((a, b) => {
    const p = a.priority.localeCompare(b.priority);
    if (p !== 0) return p;
    const s = a.set.localeCompare(b.set, undefined, { numeric: true });
    if (s !== 0) return s;
    return a.cardId.localeCompare(b.cardId, undefined, { numeric: true });
  });
  return rows;
}

/**
 * Sources that imply a physical / checklist card (printed or at least listed
 * as collectible), not a lone `<img>` href on an archived page.
 */
export const PHYSICAL_KNOWN_SOURCES: readonly KnownSource[] = [
  "carddass-fr-checklist",
  "apache-index",
  "manga-news",
  "coleka",
  "local-index",
] as const;

/**
 * Lone `carddass-html` → never printed (same bucket as S6), still tracked.
 * We do not delete the number / ref — only mark it unpublished.
 */
export function isUnpublishedHtmlRef(sources: readonly KnownSource[]): boolean {
  return sources.length > 0 && sources.every((s) => s === "carddass-html");
}

/** @deprecated alias — use {@link isUnpublishedHtmlRef} */
export const isHtmlOnlyPhantom = isUnpublishedHtmlRef;

function packRoot(): string {
  return path.join(dataRoot(), NARUTO_PACK_ID);
}

function sourcesDir(): string {
  return narutoCuratedSourcesDir();
}

function logsDir(): string {
  return path.join(packRoot(), "logs");
}

function readJson<T>(file: string): T | undefined {
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

const FILE_NAME =
  /^(ninja|tactique|technique|ni|ta|te|cl)[\s\-_]?(\d{1,3})(?:-vc)?\.(?:jpe?g|gif|png)$/i;

const PREFIX_ALIAS: Record<string, MangaNewsCardType> = {
  ninja: "ni",
  tactique: "ta",
  technique: "te",
  ni: "ni",
  ta: "ta",
  te: "te",
  cl: "cl",
};

/** `NINJA-232.jpg`, `TE-212-vc.jpg`, `NINJA 219.jpg` → `ni232`. */
export function numberFromFileName(name: string): string | undefined {
  const m = FILE_NAME.exec(name.trim());
  if (!m) return undefined;
  const type = PREFIX_ALIAS[m[1]!.toLowerCase()];
  if (!type) return undefined;
  return normalizeCardNumber(type, m[2]!);
}

type Attested = Map<string, Set<KnownSource>>;

function attest(map: Attested, number: string, source: KnownSource): void {
  const set = map.get(number) ?? new Set<KnownSource>();
  set.add(source);
  map.set(number, set);
}

export function buildNarutoKnownCards(): KnownCardsReport {
  const attested: Attested = new Map();
  const officialName = new Map<string, string>();
  const officialSets = new Map<string, string[]>();
  const localSets = new Map<string, string[]>();

  const official = readJson<{
    sets: Record<string, { ids: string[]; names: Record<string, string> }>;
  }>(path.join(sourcesDir(), "carddass-fr-checklist.json"));
  for (const [set, body] of Object.entries(official?.sets ?? {})) {
    for (const id of body.ids) {
      attest(attested, id, "carddass-fr-checklist");
      const sets = officialSets.get(id) ?? [];
      if (!sets.includes(set)) sets.push(set);
      officialSets.set(id, sets);
    }
    for (const [id, name] of Object.entries(body.names ?? {})) {
      if (!officialName.has(id)) officialName.set(id, name);
    }
  }

  const apache = readJson<{
    directories: Record<string, { files: string[] }>;
  }>(apacheIndexPath());
  for (const dir of Object.values(apache?.directories ?? {})) {
    for (const file of dir.files) {
      const number = numberFromFileName(file);
      if (number) attest(attested, number, "apache-index");
    }
  }

  const htmlRefs = readJson<{ refs: Record<string, string[]> }>(
    path.join(sourcesDir(), "carddass-html-refs.json"),
  );
  for (const number of Object.keys(htmlRefs?.refs ?? {})) {
    attest(attested, number, "carddass-html");
  }

  const coleka = readJson<{ cards: Record<string, { name?: string }> }>(
    path.join(sourcesDir(), "coleka.json"),
  );
  for (const number of Object.keys(coleka?.cards ?? {})) {
    attest(attested, number, "coleka");
  }

  const coverage = readJson<{
    cards: Array<{ number: string; inMangaNews?: boolean }>;
  }>(path.join(logsDir(), "coverage.json"));
  for (const row of coverage?.cards ?? []) {
    if (row.inMangaNews) attest(attested, row.number, "manga-news");
  }

  const indexPath = path.join(packRoot(), "cards-index.json");
  if (!existsSync(indexPath)) {
    throw new Error(`Missing ${indexPath} — run the scrape first`);
  }
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as CardsIndexV1;
  for (const entry of Object.values(index.cards)) {
    const base = String(entry.card).replace(/-cdf$/i, "");
    const m = /^(ni|te|ta|cl|pr)(\d+)$/i.exec(base);
    if (!m) continue;
    const type = m[1]!.toLowerCase();
    // `pr` promos have no checklist prefix — keep them under their own key.
    const number =
      type === "pr"
        ? `pr${String(Number.parseInt(m[2]!, 10)).padStart(3, "0")}`
        : normalizeCardNumber(type as MangaNewsCardType, m[2]!);
    attest(attested, number, "local-index");
    const sets = localSets.get(number) ?? [];
    if (!sets.includes(entry.set)) sets.push(entry.set);
    localSets.set(number, sets);
  }

  const cards: KnownCardRow[] = [...attested.entries()]
    .map(([number, sources]) => {
      const type = (number.slice(0, 2) as MangaNewsCardType) ?? "ni";
      const local = localSets.get(number) ?? [];
      return {
        number,
        type,
        sources: KNOWN_SOURCES.filter((s) => sources.has(s)),
        officialName: officialName.get(number),
        officialSets: officialSets.get(number) ?? [],
        localSets: local,
        hasArt: local.length > 0,
      };
    })
    .sort((a, b) => a.number.localeCompare(b.number));

  const counts = Object.fromEntries(
    KNOWN_SOURCES.map((s) => [
      s,
      cards.filter((c) => c.sources.includes(s)).length,
    ]),
  ) as Record<KnownSource, number>;

  const isSerie06 = (number: string): boolean =>
    // Coleka's source file *is* the Série 06 branch.
    Boolean(coleka?.cards?.[number]) ||
    // carddass.fr filed the previews under images/cartes/6/.
    (htmlRefs?.refs?.[number] ?? []).some((ref) => SERIE_06_PATH.test(ref)) ||
    (localSets.get(number) ?? []).includes(SERIE_06_SET);

  const withoutArt = cards.filter((c) => !c.hasArt);
  const unreleasedHtmlOnly = withoutArt
    .filter((c) => isUnpublishedHtmlRef(c.sources) && !isSerie06(c.number))
    .map((c) => c.number);
  const unreleased = withoutArt
    .filter((c) => isSerie06(c.number) || isUnpublishedHtmlRef(c.sources))
    .map((c) => c.number);
  const missingArt = withoutArt
    .filter((c) => !isSerie06(c.number) && !isUnpublishedHtmlRef(c.sources))
    .map((c) => c.number);

  const setsFile = readJson<{ sets: Record<string, SetInfo> }>(
    path.join(sourcesDir(), "sets.json"),
  );

  return {
    generatedAt: new Date().toISOString(),
    sets: setsFile?.sets ?? {},
    counts,
    total: cards.length,
    missingArt,
    unreleased,
    unreleasedHtmlOnly,
    unattested: cards
      .filter((c) => c.sources.length === 1 && c.sources[0] === "local-index")
      .map((c) => c.number),
    photoFallbackArt: collectPhotoFallbackArt(path.join(packRoot(), "cards")),
    cards,
  };
}

export function formatKnownCardsMarkdown(report: KnownCardsReport): string {
  const lines: string[] = [
    "# Naruto CACG — cartes connues, toutes sources",
    "",
    `Généré : ${report.generatedAt.slice(0, 10)}`,
    "",
    "Une carte est « connue » dès qu'une source l'atteste, même si on n'a",
    "aucune image. Voir `docs/naruto_carddass_fr_recovery.md`.",
    "",
    "## Séries",
    "",
    "Bandai nommait **deux starters par série**, jamais la série elle-même. Les",
    "libellés Coleka reprennent un seul starter — convention de collectionneurs.",
    "",
    "| Set | Starters officiels | Libellé Coleka |",
    "|-----|--------------------|----------------|",
    ...Object.entries(report.sets).map(([code, info]) => {
      const starters = (info.starters ?? []).filter(Boolean).join(" & ") || "—";
      return (
        `| \`${code}\` | ${starters} | ${info.colekaLabel ?? "—"}` +
        `${info.released === false ? " _(annulée)_" : ""} |`
      );
    }),
    "",
    "## Couverture par source",
    "",
    "| Source | Cartes attestées |",
    "|--------|-----------------:|",
  ];
  for (const source of KNOWN_SOURCES) {
    lines.push(`| \`${source}\` | ${report.counts[source]} |`);
  }
  lines.push(
    "",
    `**Total connu : ${report.total}** — rien n'est effacé. Dont` +
      ` **${report.missingArt.length}** imprimée(s) sans image,` +
      ` **${report.unreleased.length}** non publiée(s) papier` +
      ` (${report.unreleasedHtmlOnly.length} ref HTML seule).`,
    "",
    "## Cartes physiques sans image",
    "",
  );
  if (report.missingArt.length === 0) {
    lines.push("_Aucune._", "");
  } else {
    lines.push("| Number | Nom officiel | Attesté par |", "|---|---|---|");
    for (const number of report.missingArt) {
      const row = report.cards.find((c) => c.number === number)!;
      lines.push(
        `| \`${number}\` | ${row.officialName ?? "—"} | ${row.sources.join(", ")} |`,
      );
    }
    lines.push("");
  }
  lines.push(
    "## Non publiées papier (toujours dans le ledger)",
    "",
    "On **conserve** numéros, noms et refs. Pas d'image catalogue tant qu'il n'y",
    "a pas d'exemplaire papier — ce n'est pas une suppression.",
    "",
    "### Série 06 — annoncée, jamais imprimée",
    "",
    "Annoncée pour 2009, repoussée puis abandonnée au profit de Dragon Ball.",
    "Présentées sur carddass.fr, jamais produites.",
    "",
  );
  const s6Only = report.unreleased.filter(
    (n) => !report.unreleasedHtmlOnly.includes(n),
  );
  lines.push(
    s6Only.length
      ? `${s6Only.length} : ` + s6Only.map((n) => `\`${n}\``).join(", ")
      : "_Aucune._",
    "",
    "### Refs HTML seules (ex. `ta090`)",
    "",
    "Attestées uniquement par un chemin `carddass-html` (pas de checklist",
    "officielle, pas d'index Apache, pas de base collectionneurs). Traitées comme",
    "non publiées — le numéro reste dans `cards[]` / ce rapport.",
    "",
    report.unreleasedHtmlOnly.length
      ? report.unreleasedHtmlOnly.map((n) => `\`${n}\``).join(", ")
      : "_Aucune._",
    "",
  );
  lines.push(
    "## En base mais attestées par aucune source externe",
    "",
    "Promos et S6 sur disque : aucune checklist officielle n'existe pour ces",
    "corpus, on ne peut donc pas savoir ce qui manque — on garde quand même.",
    "",
    report.unattested.length
      ? report.unattested.map((n) => `\`${n}\``).join(", ")
      : "_Aucune._",
    "",
  );
  lines.push(
    "## Photos collector en fallback (pas de render carddass)",
    "",
    "Face affichée = plain `art.*` trop lourde (≥ ~300 KB ; site ~40–80 KB /",
    "~350×495). Pas de `art.corrected` / `art.reconstructed` préféré — OK en",
    "fallback catalogue, à préparer en reconstruct (`curated/cards/{family}/{id}/{lang}/`).",
    "",
    "_Exclut_ les cartes déjà servies via `-vc` (`art.corrected`) ou reconstruct.",
    "",
  );
  if (report.photoFallbackArt.length === 0) {
    lines.push("_Aucune._", "");
  } else {
    const high = report.photoFallbackArt.filter((r) => r.priority === "high");
    const low = report.photoFallbackArt.filter((r) => r.priority === "low");
    lines.push(
      `| Priorité | Print | Art | Ko |`,
      `|----------|-------|-----|---:|`,
    );
    for (const row of report.photoFallbackArt) {
      lines.push(
        `| ${row.priority} | \`${row.printKey}\` | \`${row.artFile}\` | ${Math.round(row.bytes / 1024)} |`,
      );
    }
    lines.push(
      "",
      `**${high.length}** priorité haute (sets publiés), **${low.length}** basse (S6 annulée).`,
      "",
    );
  }
  return lines.join("\n");
}

export function runNarutoKnownCards(): KnownCardsReport {
  const report = buildNarutoKnownCards();
  mkdirSync(logsDir(), { recursive: true });
  writeFileSync(
    path.join(logsDir(), "known-cards.json"),
    `${JSON.stringify(report, null, 1)}\n`,
  );
  writeFileSync(
    path.join(logsDir(), "known-cards.md"),
    formatKnownCardsMarkdown(report),
  );

  console.log("── Naruto known cards (all sources)");
  for (const source of KNOWN_SOURCES) {
    console.log(`   ${source.padEnd(20)} ${report.counts[source]}`);
  }
  console.log(`   ${"TOTAL".padEnd(20)} ${report.total}`);
  console.log(`   ${"sans image".padEnd(20)} ${report.missingArt.length}`);
  if (report.missingArt.length) {
    console.log(`   → ${report.missingArt.join(", ")}`);
  }
  console.log(
    `   ${"non publiées".padEnd(20)} ${report.unreleased.length}` +
      ` (S6 + refs HTML ; conservées)`,
  );
  if (report.unreleasedHtmlOnly.length) {
    console.log(
      `   ${"dont HTML seule".padEnd(20)} ${report.unreleasedHtmlOnly.join(", ")}`,
    );
  }
  const photoHigh = report.photoFallbackArt.filter(
    (r) => r.priority === "high",
  );
  console.log(
    `   ${"photo fallback".padEnd(20)} ${report.photoFallbackArt.length}` +
      ` (${photoHigh.length} high)`,
  );
  if (photoHigh.length) {
    console.log(`   → ${photoHigh.map((r) => r.printKey).join(", ")}`);
  }
  return report;
}
