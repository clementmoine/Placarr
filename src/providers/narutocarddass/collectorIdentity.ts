import { buildPrintKey, parsePrintKey } from "@/core/identify/printKey";

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
  ["shi", "ninja"],
  ["mju", "jutsu"],
  ["msa", "mission"],
  ["gaku", "ninja"],
  ["nus", "ninja"],
  ["jus", "jutsu"],
  ["mus", "mission"],
  ["cus", "client"],
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
    promo: ["pr", "ps", "prus"],
  };

/** JP 幕 / 忍者学校 — own disk folder, not NI/N/J/M voisinage. */
export const ALT_LINE_DISK_PREFIXES = new Set(["shi", "gaku", "mju", "msa"]);

const LANG_ORDER = ["fr", "en", "it", "ja", "jp"] as const;

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
  "prni",
  "opni",
  "prte",
  "prta",
  "prcl",
  "prki",
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
  const trimmed = foldPrintedNarutoRef(raw);
  const m = PREFIX_RE.exec(trimmed);
  if (!m) return null;
  let printedPrefix = m[1]!;
  let grouping: string | null = m[3] ?? null;
  const family = familyForPrefix(printedPrefix);
  if (!family) return null;
  if (grouping?.toLowerCase() === "us") {
    const usPrefix = CCG_US_PREFIX[canonicalNarutoDiskPrefix(printedPrefix)];
    if (usPrefix) {
      printedPrefix = usPrefix;
      grouping = null;
    }
  }
  return {
    family,
    number: Number(m[2]),
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
  if (printedPrefix === "騎") return "ki";
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

/** Illustration inédite, jamais imprimée hors Japon (bonus PS1 `忍-n（PS）`). */
const JP_ONLY_ARTWORK_GROUPINGS = new Set(["ps"]);

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
  return out;
}

/** `ni0063` / `ni063` → `NI-063`. `nus0097` / `n0097-us` → `N-US097`. */
export function formatNarutoReference(
  _setCode: string,
  number: string,
): string {
  const id = parseNarutoCollector(number);
  if (!id) return number;
  const prefix = canonicalNarutoDiskPrefix(id.printedPrefix);
  const width = id.number >= 1000 ? 4 : 3;
  const digits = String(id.number).padStart(width, "0");
  const us = CCG_US_PRINTED[prefix];
  if (us) return `${us}${digits}`;
  if (prefix === "prus") return `PR-US${digits}`;
  const ref = `${prefix.toUpperCase()}-${digits}`;
  const grouping = id.grouping;
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

const SERIES_SET = /^(s\d+|promo|ns|spc|maki\d+|maku\d+)$/i;

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
