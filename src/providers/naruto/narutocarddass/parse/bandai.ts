/**
 * Naruto Carddass bandai parsers.
 */

import { buildPrintKey } from "@/core/identify/printKey";
import ledger from "../curated/sources/bandaicg-en-cardlist.json";
import {
  canonicalizeNarutoPrintKey,
  mintNarutoPrintKey,
  narutoDiskCardId,
  parseNarutoCollector,
} from "../identity";
import { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import carddasJpCardlist from "../curated/sources/carddas-jp-cardlist.json";
import promoLedger from "../curated/sources/carddas-jp-promo.json";
import carddas20ProLedger from "../curated/sources/carddas20-pro.json";
import noihjpCarddassLedger from "../curated/sources/noihjp-carddass.json";
import { narutoDumpFaceRank } from "../disk";
import bggEnCcgS1 from "../curated/sources/bgg-en-ccg-s1.json";

// ─── parseBandaicgAsset ──────────────────────────────────────────────────────────

/**
 * Map Wayback / bandaicg.com EN CCG card image paths to print identity.
 * Pure — no I/O.
 *
 * Official tree: `naruto/images/cards_s{N}/{n|j|m|c|pr|ps}###[_t].jpg`
 * Promo folder: `cards_pr/`.
 * Set codes: `s1`…`s28`, `promo` — same series tree as FR/JP; locale = `en`
 * under `cards/{set}/en/…`. Dump target today: `staging/bandaicg-en/`.
 * TCDB checklists use invented prefixes (`PTHJ-001`) — see `parseTcdbNaruto`.
 * Do not promote those scans onto `cards/s1/en/` next to Carddass FR s1.
 */
export type ParsedBandaicgAsset = {
  /** Set code: `s1`… or `promo` */
  set: string;
  /** Letter prefix as on file: `n`, `j`, `m`, `c`, `pr`, `ps`, … */
  cardType: string;
  /** Full collector id: `n001`, `pr018b` */
  number: string;
  role: "art" | "thumb";
  printKey: string;
  cardId: string;
};

/** @deprecated Prefer {@link narutoSetCode} — EN no longer uses an `en.` prefix. */
export function enSetCode(series: string): string {
  return narutoSetCode(series);
}

/**
 * Parse a bandaicg.com card image URL or pathname.
 * Returns null for chrome / unrecognised files.
 */
export function parseBandaicgAssetPath(
  urlOrPath: string,
): ParsedBandaicgAsset | null {
  let pathname: string;
  try {
    pathname = urlOrPath.includes("://")
      ? new URL(urlOrPath).pathname
      : urlOrPath;
  } catch {
    pathname = urlOrPath;
  }
  pathname = decodeURIComponent(pathname).replace(/\\/g, "/");

  const m = pathname.match(
    /\/naruto\/images\/(cards_(?:pr|s\d+))\/([^/]+\.(?:jpe?g|png|gif|webp))$/i,
  );
  if (!m) return null;

  const folder = m[1]!.toLowerCase();
  const filename = m[2]!;
  let series: string;
  if (folder === "cards_pr") {
    series = "promo";
  } else {
    const sm = folder.match(/^cards_s(\d+)$/);
    if (!sm) return null;
    series = `s${sm[1]}`;
  }
  const set = narutoSetCode(series);

  const base = filename.replace(/\.(jpe?g|png|gif|webp)$/i, "");
  const thumb = /_t$/i.test(base);
  const stem = base.replace(/_t$/i, "").toLowerCase();

  // n001 | j042 | m005 | c012 | pr018b | ps004
  const parts = stem.match(/^([a-z]+)(\d+[a-z]*)$/i);
  if (!parts) return null;
  const cardType = parts[1]!.toLowerCase();
  const number = `${cardType}${parts[2]!.toLowerCase()}`;

  const printKey = buildPrintKey({
    game: NARUTO_GAME,
    set,
    number,
    grouping: null,
  });
  if (!printKey) return null;

  return {
    set,
    cardType,
    number,
    role: thumb ? "thumb" : "art",
    printKey,
    cardId: number,
  };
}

/** Collector type from on-disk card id (`ni023` → `ni`, `n001` → `n`, `pr002` → `pr`). */
export function cardTypeFromCollectorNumber(number: string): string {
  const m = number
    .trim()
    .toLowerCase()
    .match(/^([a-z]+)/);
  return m?.[1] ?? number.slice(0, 2).toLowerCase();
}

// ─── parseBandaicgCardlist ──────────────────────────────────────────────────────────

/**
 * Official Bandai USA CCG cardlists (bandaicg.com Wayback).
 * Source of truth: `curated/sources/bandaicg-en-cardlist.json`.
 * Titles only — no faces. N/J/M/C, never NI. Skip N-US tin exclusives.
 */
export type BandaicgEnCardlistRow = (typeof ledger.cards)[number];

const bandaicgCardlist_ROW_RE =
  /card_col1"[^>]*>\s*([A-Z]{1,3}-?(?:US-?)?\d+)\s*<\/div>\s*<div class="card_link">(?:<a\b[^>]*>)?([^<]+)/gi;

export function bandaicgEnCardlistLedger() {
  return ledger;
}

export function bandaicgEnCardlistCards(): BandaicgEnCardlistRow[] {
  return ledger.cards;
}

export function parseBandaicgCardlistHtml(
  html: string,
  setCode: string,
): Array<{
  number: string;
  cardType: string;
  name: string;
  setCode: string;
  printed: string;
  rarity: string | null;
}> {
  const out: Array<{
    number: string;
    cardType: string;
    name: string;
    setCode: string;
    printed: string;
    rarity: string | null;
  }> = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(bandaicgCardlist_ROW_RE)) {
    const printed = match[1]!.replace(/\s+/g, "").toUpperCase();
    const parsed = parseEnCcgPrintedRef(printed);
    if (!parsed?.number || parsed.usExclusive) continue;
    if (seen.has(parsed.number)) continue;
    const name = match[2]!.replace(/\s+/g, " ").trim();
    if (!name) continue;
    const rarityMatch = html
      .slice(match.index ?? 0, (match.index ?? 0) + match[0].length + 180)
      .match(/card_col3"[^>]*>\s*([^<]+)\s*</i);
    seen.add(parsed.number);
    out.push({
      number: parsed.number,
      cardType: parsed.cardType,
      name,
      setCode,
      printed,
      rarity: rarityMatch?.[1]?.trim() || null,
    });
  }
  return out;
}

export function mergeBandaicgEnNamesIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleKeys = new Set(
    titles.map(
      (t) =>
        `${canonicalizeNarutoPrintKey(t.printKey)}\0${t.lang.toLowerCase()}`,
    ),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of bandaicgEnCardlistCards()) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey) continue;
    const diskId = narutoDiskCardId(row.number) ?? row.number;
    const parsed = parseNarutoCollector(row.number);
    if (!printByKey.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: row.setCode,
        number: diskId,
        cardType: cardTypeFromCollectorNumber(diskId),
        family: parsed?.family ?? null,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }
    const titleKey = `${printKey}\0en`;
    if (titleKeys.has(titleKey)) continue;
    const name = row.name.trim();
    if (!name) continue;
    titles.push({
      printKey,
      lang: "en",
      fullName: name,
      rarity: row.rarity ?? null,
    });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}

// ─── parseCarddasJpAsset ──────────────────────────────────────────────────────────

/**
 * Map Wayback / carddas.com JP card specials (sparse official archive).
 * Pure — no I/O.
 *
 * Official CDX only retained a handful of `cardlist/card_img/*_spc2.gif`
 * (not a full 巻ノ… face dump). Hole-fill copies those GIFs into
 * `cards/{family}/{ni0001}/ja/` when art is missing. Legacy printKey still
 * uses set `spc`.
 */
export const NARUTO_JP_SPC_SET = narutoSetCode("spc");

export type ParsedCarddasJpAsset = {
  set: string;
  /** Coarse type from filename prefix when present */
  kind: "jutsu" | "irai" | "saku" | "other";
  /** Filename stem, e.g. `jutsu-027_spc2` */
  stem: string;
  /** Alphanumeric collector id for disk + printKey */
  number: string;
  cardId: string;
  printKey: string;
  /** Extension including dot */
  ext: string;
};

/**
 * Parse a carddas.com JP card_img URL.
 * Returns null for chrome (`head.gif`) or unrecognised paths.
 */
export function parseCarddasJpAssetPath(
  urlOrPath: string,
): ParsedCarddasJpAsset | null {
  let pathname: string;
  try {
    pathname = urlOrPath.includes("://")
      ? new URL(urlOrPath).pathname
      : urlOrPath;
  } catch {
    pathname = urlOrPath;
  }
  pathname = decodeURIComponent(pathname).replace(/\\/g, "/");

  const m = pathname.match(
    /\/naruto\/cardlist\/card_img\/([^/]+\.(?:jpe?g|png|gif|webp))$/i,
  );
  if (!m) return null;

  const filename = m[1]!;
  const extMatch = filename.match(/(\.[a-z0-9]+)$/i);
  const ext = (extMatch?.[1] ?? ".gif").toLowerCase();
  const stem = filename.replace(/\.(jpe?g|png|gif|webp)$/i, "").toLowerCase();
  if (stem === "head" || stem.startsWith("head")) return null;

  let kind: ParsedCarddasJpAsset["kind"] = "other";
  if (stem.startsWith("jutsu")) kind = "jutsu";
  else if (stem.startsWith("irai")) kind = "irai";
  else if (stem.startsWith("saku")) kind = "saku";

  // printKey segment: alnum only (drop hyphens / underscores)
  const number = stem.replace(/[^a-z0-9]/gi, "");
  if (!number) return null;

  const printKey = buildPrintKey({
    game: NARUTO_GAME,
    set: NARUTO_JP_SPC_SET,
    number,
    grouping: null,
  });
  if (!printKey) return null;

  return {
    set: NARUTO_JP_SPC_SET,
    kind,
    stem,
    number,
    cardId: number,
    printKey,
    ext,
  };
}

const SPC2_FACE_RE = /^(shinobi|jutsu|saku|irai)-(\d+)_spc2$/i;
/** `shinobi-146_7` / `jutsu-348_17` / vol.1 `shinobi-003_1`. */
const VOLUME_FACE_RE = /^(shinobi|jutsu|saku|irai)-(\d+)_(\d{1,2})$/i;
/** `/card/shinobi-352.gif` — prefixed, no volume suffix. */
const BARE_FACE_RE = /^(shinobi|jutsu|saku|irai)-(\d+)$/i;
/** `shinobi_372_16` (underscore dump). */
const UNDERSCORE_VOLUME_FACE_RE =
  /^(shinobi|jutsu|saku|irai)_(\d+)_(\d{1,2})$/i;
const MAKU_JU_FACE_RE = /^ju-(\d+)_d\d$/i;

const SPC2_PREFIX: Record<string, string> = {
  shinobi: "ni",
  jutsu: "te",
  saku: "ta",
  irai: "cl",
};

function diskIdFromKindNumber(
  kind: string | undefined,
  rawNumber: string | undefined,
): string | null {
  if (!kind || !rawNumber) return null;
  const prefix = SPC2_PREFIX[kind.toLowerCase()];
  return prefix ? narutoDiskCardId(`${prefix}${rawNumber}`) : null;
}

/**
 * Sparse official GIFs → disk id for hole-fill (`shinobi-393_spc2` → `ni0393`).
 * Volume dumps use `shinobi-146_7` / `jutsu-348_17` (巻ノ number, not a
 * second collector id). Numbered `001.gif` chrome and event JPEGs stay
 * unmapped — faces on this host are GIFs.
 */
export function carddasJpStagingFaceToDiskId(filename: string): string | null {
  const base = filename.split("/").pop() ?? "";
  if (!/\.(gif|png|webp)$/i.test(base)) return null;
  const stem = base.replace(/\.(gif|png|webp)$/i, "");
  if (!stem) return null;
  const spc = SPC2_FACE_RE.exec(stem);
  if (spc) return diskIdFromKindNumber(spc[1], spc[2]);
  const volume = VOLUME_FACE_RE.exec(stem);
  if (volume) return diskIdFromKindNumber(volume[1], volume[2]);
  const underscore = UNDERSCORE_VOLUME_FACE_RE.exec(stem);
  if (underscore) return diskIdFromKindNumber(underscore[1], underscore[2]);
  const bare = BARE_FACE_RE.exec(stem);
  if (bare) return diskIdFromKindNumber(bare[1], bare[2]);
  const maku = MAKU_JU_FACE_RE.exec(stem);
  if (maku) return narutoDiskCardId(`mju${maku[1]}`);
  return null;
}

function carddasJpStagingFaceIsSpecial(stem: string): boolean {
  return SPC2_FACE_RE.test(stem) || MAKU_JU_FACE_RE.test(stem);
}

let cardlistDiskIds: Set<string> | null = null;

function carddasJpCardlistDiskIds(): Set<string> {
  if (!cardlistDiskIds) {
    cardlistDiskIds = new Set(
      carddasJpCardlistCards().map((row) => row.number.toLowerCase()),
    );
  }
  return cardlistDiskIds;
}

/**
 * Install only when the filename maps onto an official 巻ノ… id, or a
 * known special (`_spc2`, Maku `ju-N_dN`). Bare `/card/saku-214.gif`
 * dumps are sequential site ids — not 作-214.
 */
export function carddasJpStagingFaceInstallTarget(
  filename: string,
): string | null {
  const diskId = carddasJpStagingFaceToDiskId(filename);
  if (!diskId) return null;
  const stem = (filename.split("/").pop() ?? "").replace(
    /\.(gif|png|webp)$/i,
    "",
  );
  if (carddasJpStagingFaceIsSpecial(stem)) return diskId;
  return carddasJpCardlistDiskIds().has(diskId.toLowerCase()) ? diskId : null;
}

// ─── parseCarddasJpCardlist ──────────────────────────────────────────────────────────

/**
 * Official JP Carddass CG checklists — `cardlist/1st.shtml`…`17th.shtml`.
 * Source of truth: `curated/sources/carddas-jp-cardlist.json` (parsed from
 * the Wayback mirror). 忍/術/作/依 = NI/TE/TA/CL. Not Data Carddass.
 */
export type CarddasJpCardlistRow = (typeof carddasJpCardlist.cards)[number];

const PREFIX: Record<string, string> = {
  忍: "ni",
  術: "te",
  作: "ta",
  依: "cl",
};

const VOLUME_SET: Record<string, string> = {
  巻ノ壱: "maki1",
  巻ノ弐: "maki2",
  巻ノ二: "maki2",
  巻ノ参: "maki3",
  巻ノ三: "maki3",
  巻ノ四: "maki4",
  巻の四: "maki4",
  巻ノ五: "maki5",
  巻ノ六: "maki6",
  巻ノ七: "maki7",
  巻ノ八: "maki8",
  巻ノ九: "maki9",
  巻ノ十: "maki10",
  巻ノ十一: "maki11",
  巻ノ十二: "maki12",
  巻ノ十三: "maki13",
  巻ノ十四: "maki14",
  巻ノ十五: "maki15",
  巻ノ十六: "maki16",
  巻ノ十七: "maki17",
};

const carddasJpCardlist_ROW_RE =
  />(忍|術|作|依)[-−]?(\d+)<\/td>\s*<td[^>]*>[\s\S]*?<font color="[^"]+">([^<]+)<\/font>[\s\S]*?<\/td>\s*<td[^>]*>([^<]+)<\/td>/g;

export function carddasJpCardlistLedger() {
  return carddasJpCardlist;
}

export function carddasJpCardlistCards(): CarddasJpCardlistRow[] {
  return carddasJpCardlist.cards;
}

export function carddasJpVolumeSetCode(volume: string): string | null {
  const key = volume.replace(/\s+/g, "");
  return VOLUME_SET[key] ?? null;
}

/** Decode already-as-text HTML (tests use UTF-8; live files are Shift_JIS). */
export function parseCarddasJpCardlistHtml(
  html: string,
  fallbackSet: string,
): Array<{
  printed: string;
  number: string;
  name: string;
  setCode: string;
  volume: string;
}> {
  const out: Array<{
    printed: string;
    number: string;
    name: string;
    setCode: string;
    volume: string;
  }> = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(carddasJpCardlist_ROW_RE)) {
    const prefix = PREFIX[match[1]!];
    if (!prefix) continue;
    const n = Number.parseInt(match[2]!, 10);
    if (!Number.isFinite(n) || n < 1) continue;
    const number = `${prefix}${String(n).padStart(4, "0")}`;
    if (seen.has(number)) continue;
    const volume = match[4]!.replace(/\s+/g, "");
    const setCode = carddasJpVolumeSetCode(volume) ?? fallbackSet;
    seen.add(number);
    out.push({
      printed: `${match[1]}-${n}`,
      number,
      name: match[3]!.trim(),
      setCode,
      volume,
    });
  }
  return out;
}

export function mergeCarddasJpNamesIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleKeys = new Set(
    titles.map(
      (t) =>
        `${canonicalizeNarutoPrintKey(t.printKey)}\0${t.lang.toLowerCase()}`,
    ),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of carddasJpCardlistCards()) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey) continue;
    const diskId = narutoDiskCardId(row.number) ?? row.number;
    const parsed = parseNarutoCollector(row.number);
    if (!printByKey.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: row.setCode,
        number: diskId,
        cardType: cardTypeFromCollectorNumber(diskId),
        family: parsed?.family ?? null,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }
    const titleKey = `${printKey}\0ja`;
    if (titleKeys.has(titleKey)) continue;
    const name = row.name.trim();
    if (!name) continue;
    titles.push({ printKey, lang: "ja", fullName: name });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}

// ─── parseCarddasJpExtras ──────────────────────────────────────────────────────────

/**
 * Les extras officiels japonais d'après 巻ノ壱…十七 : `promo.shtml`. Titres seuls.
 *
 * Les listes 幕 et 学 étaient lues ici aussi, jusqu'au 2026-08-21. Elles
 * décrivent un **autre jeu** — le 疾風伝 de 2007 — que ce pack fusionnait dans
 * son index pour le refiltrer à la sortie : du travail fait pour être jeté. Les
 * deux registres sont partis avec leur jeu.
 */
export type CarddasJpExtraRow = {
  printed: string;
  number: string;
  name: string;
  setCode: string;
};

export function carddasJpPromoCards(): CarddasJpExtraRow[] {
  return promoLedger.cards as CarddasJpExtraRow[];
}

function mergeJaRows(
  input: { prints: NarutoPrintRow[]; titles: NarutoTitleRow[] },
  rows: readonly CarddasJpExtraRow[],
): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleKeys = new Set(
    titles.map(
      (t) =>
        `${canonicalizeNarutoPrintKey(t.printKey)}\0${t.lang.toLowerCase()}`,
    ),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of rows) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey) continue;
    const diskId = narutoDiskCardId(row.number) ?? row.number;
    const parsed = parseNarutoCollector(row.number);
    if (!printByKey.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: row.setCode,
        number: diskId,
        cardType: cardTypeFromCollectorNumber(diskId),
        family: parsed?.family ?? null,
        grouping: parsed?.grouping ?? null,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }
    const titleKey = `${printKey}\0ja`;
    if (titleKeys.has(titleKey)) continue;
    const name = row.name.trim();
    if (!name) continue;
    titles.push({ printKey, lang: "ja", fullName: name });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}

export function mergeCarddasJpPromoIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}) {
  return mergeJaRows(input, carddasJpPromoCards());
}

/**
 * Fan checklist http://carddas20.com/memo/pro.html — titles / existence only.
 * Runs after official `carddas-jp-promo` so it only fills holes (CAN-1…6, …).
 */
export function carddas20ProCards(): CarddasJpExtraRow[] {
  return carddas20ProLedger.cards as CarddasJpExtraRow[];
}

export function mergeCarddas20ProIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}) {
  return mergeJaRows(input, carddas20ProCards());
}

/**
 * Fan catalogue http://naruto.noihjp.com/Goods/Carddas/ — titles / existence.
 * After carddas20: fills COIN-9/11 names and leftover volume holes.
 */
export function noihjpCarddassCards(): CarddasJpExtraRow[] {
  return noihjpCarddassLedger.cards as CarddasJpExtraRow[];
}

export function mergeNoihjpCarddassIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}) {
  return mergeJaRows(input, noihjpCarddassCards());
}

// ─── parseCarddassAsset ──────────────────────────────────────────────────────────

/**
 * Map Wayback / carddass.fr card image paths to Placarr print identity.
 * Pure — no I/O.
 *
 * Pack / game umbrella = `naruto`. Set = series only (`s1`…`s6`, `promo`, `ns`).
 * Locale is a disk/title axis under `cards/{set}/{fr|en|jap}/{cardId}/`, not
 * part of the set code or printKey.
 */
/** Pack + printKey game slug — all Naruto TCG locales. */
export const NARUTO_GAME = "naruto";

/** On-disk / title locales for the shared series tree. */
export const NARUTO_LANG_FR = "fr";
export const NARUTO_LANG_EN = "en";
export const NARUTO_LANG_JAP = "jap";

/** @deprecated Use {@link NARUTO_GAME} — kept for one release of grep/migrate. */
export const NARUTO_CCG_GAME = NARUTO_GAME;

export type CarddassCardType = "ni" | "te" | "ta" | "cl";

export type ParsedCarddassAsset = {
  /** Set code: `s1`…`s6`, `promo`, or `ns` */
  set: string;
  type: CarddassCardType;
  /** Collector number digits as on file, zero-padded preserved when present */
  numberDigits: string;
  /** e.g. ni023 */
  number: string;
  /** promo grouping when applicable (e.g. cdf) */
  grouping: string | null;
  /**
   * `art` = as published on carddass.fr;
   * `corrected` = `-vc` (version corrigée / errata text) — prefer when serving.
   */
  role: "art" | "corrected";
  printKey: string;
  /** Disk card id under cards/{set}/{lang}/{cardId}/ */
  cardId: string;
};

const TYPE_FROM_PREFIX: Record<string, CarddassCardType> = {
  ninja: "ni",
  technique: "te",
  te: "te",
  tactique: "ta",
  ta: "ta",
  client: "cl",
  clients: "cl",
  cl: "cl",
};

/** carddass.fr folder segment → series set code. */
const SERIES_DIR: Record<string, string> = {
  "1": "s1",
  "2": "s2",
  "3": "s3",
  "4": "s4",
  s4: "s4",
  "5": "s5",
  "6": "s6",
  promo: "promo",
};

/** Series / promo / special set folders under `cards/`. */
export function isNarutoSetDir(name: string): boolean {
  return /^(s\d+|promo|ns|spc)$/i.test(name);
}

/** Identity set code from a series slug (`s1`, `promo`, …). */
export function narutoSetCode(series: string): string {
  return series.trim().toLowerCase();
}

/** @deprecated Prefer {@link narutoSetCode} — same value now (no line prefix). */
export function cacgSetCode(series: string): string {
  return narutoSetCode(series);
}

function buildKey(
  set: string,
  number: string,
  grouping: string | null,
): string | null {
  return buildPrintKey({
    game: NARUTO_GAME,
    set,
    number,
    grouping,
  });
}

/**
 * Parse a carddass.fr image URL or pathname.
 * Returns null for thumbnails, chrome, or unrecognised files.
 */
export function parseCarddassAssetPath(
  urlOrPath: string,
): ParsedCarddassAsset | null {
  let pathname: string;
  try {
    pathname = urlOrPath.includes("://")
      ? new URL(urlOrPath).pathname
      : urlOrPath;
  } catch {
    pathname = urlOrPath;
  }
  pathname = decodeURIComponent(pathname).replace(/\\/g, "/");

  const lower = pathname.toLowerCase();
  if (!lower.includes("/naruto/images/cartes/")) return null;
  if (lower.includes("/cartes_med/")) return null;
  if (lower.includes("/packshots/")) return null;

  const m = pathname.match(
    /\/naruto\/images\/cartes\/([^/]+)\/(?:([^/]+)\/)?([^/]+\.(?:jpe?g|png|webp))$/i,
  );
  if (!m) return null;

  const seriesRaw = m[1]!.toLowerCase();
  const filename = m[3]!;
  const series = SERIES_DIR[seriesRaw];
  if (!series) return null;
  const resolvedSet = narutoSetCode(series);

  const base = filename.replace(/\.(jpe?g|png|webp)$/i, "");
  if (
    series === "promo" &&
    !/^(ninja|technique|tactique|client|te|ta|cl|ni)[\s_-]/i.test(base)
  ) {
    return null;
  }

  const stem = base.replace(/\s+/g, "-");
  const vc = /[-_]vc$/i.test(stem);
  let core = stem.replace(/[-_]vc$/i, "");

  let grouping: string | null = null;
  const cdf = core.match(/^(.*)[-_]cdf$/i);
  if (cdf) {
    core = cdf[1]!;
    grouping = "cdf";
  }

  const parts = core.match(
    /^(ninja|technique|tactique|client|clients|te|ta|cl|ni)[\s_-]+(\d+)$/i,
  );
  if (!parts) return null;

  const type = TYPE_FROM_PREFIX[parts[1]!.toLowerCase()];
  if (!type) return null;
  const numberDigits = parts[2]!;
  const number = `${type}${numberDigits}`;

  const printKey = buildKey(resolvedSet, number, grouping);
  if (!printKey) return null;

  const cardId = grouping ? `${number}-${grouping}` : number;

  return {
    set: resolvedSet,
    type,
    numberDigits,
    number,
    grouping,
    role: vc ? "corrected" : "art",
    printKey,
    cardId,
  };
}

/** Canonical on-disk name for a Carddass scrape role. */
export function carddassFaceFilename(
  role: ParsedCarddassAsset["role"],
  ext: string,
): string {
  const e = ext.startsWith(".") ? ext : `.${ext}`;
  return role === "corrected" ? `art.corrected${e}` : `art.carddass${e}`;
}

/**
 * Display order: `art.reconstructed.*` → `art.corrected.*` → dump
 * `art.<source>.*` (pixels via `face.json`, filename tie-break here).
 *
 * `reconstructed` wins because the official S5 faces carry a burnt-in
 * `www.carddass.fr` watermark and some errata scans are crude; a hand-made
 * face is the better thing to show. It never replaces the official file on
 * disk — that one stays as the authentic source.
 *
 * The `$` anchors matter: `art.reconstructed.png` and `art.corrected.jpg`
 * must not be picked up by the plain `art.*` pattern.
 */
export function pickPreferredFaceArtFilename(
  files: readonly string[],
  lang = "fr",
): string | null {
  let best: { name: string; rank: number } | null = null;
  for (const f of files) {
    const rank = faceArtRank(f, lang);
    if (rank > 0 && (!best || rank > best.rank)) best = { name: f, rank };
  }
  return best?.name ?? null;
}

/**
 * Display precedence of a face filename — higher wins. Any code choosing
 * between two faces must use this, so the order lives in one place: a scrape
 * merging freshly downloaded files with what is already on disk would
 * otherwise silently drop a reconstruction it does not know about.
 *
 * 0 means "not a face" (thumb, back, …).
 */
export function faceArtRank(filename: string, lang = "fr"): number {
  if (/^art\.reconstructed\.(jpe?g|png|webp|gif)$/i.test(filename)) return 300;
  if (/^art\.corrected\.(jpe?g|png|webp|gif)$/i.test(filename)) return 200;
  return narutoDumpFaceRank(filename, lang);
}

/** Prefer newest capture; CDX rows are [timestamp, original, …]. */
export function pickLatestCdxRow(
  rows: readonly (readonly string[])[],
): { timestamp: string; original: string } | null {
  let best: { timestamp: string; original: string } | null = null;
  for (const row of rows) {
    const timestamp = row[0];
    const original = row[1];
    if (!timestamp || !original) continue;
    if (!best || timestamp > best.timestamp) {
      best = { timestamp, original };
    }
  }
  return best;
}

export function waybackRawUrl(timestamp: string, original: string): string {
  const ts = timestamp.replace(/\D/g, "");
  return `https://web.archive.org/web/${ts}id_/${original}`;
}

const MED_TYPE: Record<string, CarddassCardType> = {
  ninja: "ni",
  ni: "ni",
  technique: "te",
  te: "te",
  tactique: "ta",
  ta: "ta",
  client: "cl",
  clients: "cl",
  cl: "cl",
};

/**
 * Parse a carddass.fr `cartes_med` filename → collector number.
 * Does not invent files — map-only helper for site thumbs already on disk.
 */
export function parseCarddassMedThumbFilename(
  filename: string,
): { type: CarddassCardType; number: string } | null {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const stem = base.replace(/\.(jpe?g|png|webp|gif)$/i, "");
  const m = stem.match(
    /^(ninja|technique|tactique|clients?|te|ta|cl|ni)[\s_-]*0*(\d+)/i,
  );
  if (!m) return null;
  const type = MED_TYPE[m[1]!.toLowerCase()];
  if (!type) return null;
  const numberDigits = String(Number.parseInt(m[2]!, 10));
  if (!Number.isFinite(Number(numberDigits))) return null;
  return {
    type,
    number: `${type}${numberDigits.padStart(3, "0")}`,
  };
}

/** Prefer med over mini over bare when several thumbs share a number. */
export function medThumbRank(filename: string): number {
  const low = filename.toLowerCase();
  if (low.includes("med")) return 3;
  if (low.includes("mini")) return 2;
  return 1;
}

// ─── parseEnCcgPrinted ──────────────────────────────────────────────────────────

/**
 * Printed Bandai USA CCG collector codes (`N-1646`, `N-US122`, `PR-060`).
 * Not TCDB acronyms (`PTHJ-001`) and not Carddass (`NI-1650`).
 *
 * `N-US122` is a tin/US exclusive — disk `nus0122`, never `n0122`.
 */
export type EnCcgPrinted = {
  cardType: "n" | "j" | "m" | "c" | "pr" | "ps";
  /** Disk id `n1646` / `nus122` / `pr060`. */
  number: string | null;
  usExclusive: boolean;
};

const TYPE: Record<string, EnCcgPrinted["cardType"]> = {
  n: "n",
  j: "j",
  m: "m",
  c: "c",
  pr: "pr",
  ps: "ps",
};

function padCollector(prefix: string, digits: string): string {
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 1) return `${prefix}${digits.toLowerCase()}`;
  const width = Math.max(digits.length, 3);
  return `${prefix}${String(n).padStart(width, "0")}`;
}

/** `N-1646` / `N-US122` / `C-035` / `PR-060`. */
export function parseEnCcgPrintedRef(raw: string): EnCcgPrinted | null {
  const m =
    /^(N|J|M|C|PR|PS)[\s-]*(US)?[\s-]*(\d{1,4})$/i.exec(raw.trim()) ?? null;
  if (!m) return null;
  const cardType = TYPE[m[1]!.toLowerCase()];
  if (!cardType) return null;
  const usExclusive = Boolean(m[2]);
  const digits = m[3]!;
  const prefix = usExclusive ? `${cardType}us` : cardType;
  return {
    cardType,
    number: padCollector(prefix, digits),
    usExclusive,
  };
}

// ─── parseBggNarutoList ──────────────────────────────────────────────────────────

/**
 * BGG `narutotcglist.xls` (filepage 20590) — Bandai USA CCG Series 1
 * checklist. Source of truth: `curated/sources/bgg-en-ccg-s1.json`.
 *
 * Names stay as the 2006 sheet wrote them. Printed refs are N/J/M.
 * Not TCDB `PTH*`, not Carddass `NI/TE`. Not `cards/s1/en/`.
 */
export type BggNarutoListRow = (typeof bggEnCcgS1.cards)[number];

/** Appearance only — EN Path to Hokage, not Carddass FR Série 1 folders. */
export const BGG_EN_CCG_S1_SET = "s1";
export const BGG_EN_CCG_S1_LANG = "en";

export function bggEnCcgS1Ledger() {
  return bggEnCcgS1;
}

export function bggEnCcgS1Cards(): BggNarutoListRow[] {
  return bggEnCcgS1.cards;
}

/** `N` + `001` → printed `N-001` → `n001`. */
export function bggEnCcgPrinted(row: BggNarutoListRow): EnCcgPrinted | null {
  return parseEnCcgPrintedRef(`${row.type}-${row.number}`);
}

/**
 * Inject Path to Hokage prints + EN titles. No faces — do not write
 * `cards/s1/en/`. `naruto:n-0001` stays distinct from `naruto:ni-0001`.
 */
export function mergeBggEnCcgS1IntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleKeys = new Set(
    titles.map(
      (t) =>
        `${canonicalizeNarutoPrintKey(t.printKey)}\0${t.lang.toLowerCase()}`,
    ),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of bggEnCcgS1Cards()) {
    const printed = bggEnCcgPrinted(row);
    if (!printed?.number || printed.usExclusive) continue;
    const printKey = mintNarutoPrintKey(printed.number);
    if (!printKey) continue;
    const diskId = narutoDiskCardId(printed.number) ?? printed.number;
    const parsed = parseNarutoCollector(printed.number);

    if (!printByKey.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: BGG_EN_CCG_S1_SET,
        number: diskId,
        cardType: cardTypeFromCollectorNumber(diskId),
        family: parsed?.family ?? null,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }

    const name = row.name.trim();
    if (!name) continue;
    const titleKey = `${printKey}\0${BGG_EN_CCG_S1_LANG}`;
    if (titleKeys.has(titleKey)) continue;
    titles.push({
      printKey,
      lang: BGG_EN_CCG_S1_LANG,
      fullName: name,
      rarity: row.rarity?.trim() || null,
    });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}
