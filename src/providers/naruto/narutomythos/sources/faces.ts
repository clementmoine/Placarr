/**
 * Mythos face harvest / install + site-id / Narutopia mapping.
 *
 * Merged from: siteCardId, narutopiaMap, scanflipFaces, siteFaces,
 * officialFaces, narutopiaFaces, lorenzoneFaces.
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

import sharp from "sharp";

import { parsePrintKey } from "@/core/identify/printKey";
import { httpGet } from "@/lib/http/httpClient";
import {
  packCardDir,
  packCardsDir,
  packStagingDir,
} from "@/lib/packPaths";
import {
  downloadCardFaceBytes,
  installCardFace,
} from "@/providers/shared/cardCatalogue/faceInstall";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { parseNarutopiaChecklistHtml } from "@/providers/naruto/shared/narutopia/parseChecklistPage";
import {
  harvestScanflipCards,
  scanflipFaceUrl,
  type ScanflipCardRow,
  type ScanflipExplorerSpec,
} from "@/providers/shared/scanflip/client";

import {
  NARUTO_MYTHOS_KS1E2_SET_CODE,
  NARUTO_MYTHOS_KS1PROMO_SET_CODE,
  mergeOfficialMythosLangRows,
  parseOfficialMythosApiPayload,
  type MythosOfficialPrint,
} from "../parse/catalogues";
import { narutoMythosCuratedDir, NARUTO_MYTHOS_PACK_ID } from "../pack";
import {
  MYTHOS_TITLE_LANG,
  mythosOfficialChecklistPath,
  readAllMythosChecklists,
  type MythosChecklistCard,
} from "../pipeline/ledgers";
import {
  NARUTO_MYTHOS_AK3_SET_CODE,
  NARUTO_MYTHOS_KS1_SET_CODE,
  NARUTO_MYTHOS_SS2_SET_CODE,
  mythosPrintKey,
} from "../printKey";

/** Shared Safari UA for CICABOOM / narutomythos.com / Narutopia harvests. */
const MYTHOS_HARVEST_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

// ─── siteCardId ─────────────────────────────────────────────────────────────

const SITE_PREFIX_TO_SET: Record<string, string> = {
  KS: NARUTO_MYTHOS_KS1_SET_CODE,
  SS: "ss2",
  AK: "ak3",
};

/**
 * Grouping letter on the fan-site id (`A` / `V` / `SV`).
 * Rarity codes on the site (`AR`, `MY`) are not on the id itself.
 */
export function groupingFromNarutomythosSiteSuffix(
  suffix: string | null | undefined,
): string | null {
  const letter = (suffix ?? "").trim().toUpperCase();
  if (!letter) return null;
  if (letter === "A") return "a";
  if (letter === "V") return "v";
  if (letter === "SV") return "sv";
  // Fan DB « ES » = exclu FR (tome / promo) — printed as Mythos V.
  if (letter === "ES") return "v";
  return null;
}

/**
 * Candidate printKeys for a marketplace / cards API id (preferred first).
 * Empty when the id is unknown or not Mythos.
 */
export function printKeysForNarutomythosSiteCardId(cardId: string): string[] {
  const raw = cardId.trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) return [];

  // Showcase / legendary on the fan DB — official key is lg01.
  if (raw === "KS-000-GOLD" || raw === "KS-000" || raw === "KS-LEG01") {
    const key = mythosPrintKey(NARUTO_MYTHOS_KS1_SET_CODE, "lg01", null);
    return key ? [key] : [];
  }

  let m = raw.match(/^([A-Z]+)-M0*(\d+)$/);
  if (m) {
    const setCode = SITE_PREFIX_TO_SET[m[1]!] ?? null;
    if (!setCode) return [];
    const number = `mss${m[2]!.padStart(2, "0")}`;
    const key = mythosPrintKey(setCode, number, null);
    return key ? [key] : [];
  }

  m = raw.match(/^([A-Z]+)-LEG0*(\d+)$/);
  if (m) {
    const setCode = SITE_PREFIX_TO_SET[m[1]!] ?? null;
    if (!setCode) return [];
    const number = `lg${m[2]!.padStart(2, "0")}`;
    const key = mythosPrintKey(setCode, number, null);
    return key ? [key] : [];
  }

  m = raw.match(/^([A-Z]+)-0*(\d+)(?:-([A-Z]+))?$/);
  if (!m) return [];
  const setCode = SITE_PREFIX_TO_SET[m[1]!] ?? null;
  if (!setCode) return [];
  const number = m[2]!.padStart(4, "0");
  const grouping = groupingFromNarutomythosSiteSuffix(m[3] ?? null);
  // Unknown suffix (e.g. GOLD on a numbered card) — skip rather than guess.
  if (m[3] && !grouping) return [];

  const keys: string[] = [];
  const push = (set: string, g: string | null) => {
    const key = mythosPrintKey(set, number, g);
    if (key && !keys.includes(key)) keys.push(key);
  };

  if (grouping === "v" || grouping === "sv") {
    push(NARUTO_MYTHOS_KS1PROMO_SET_CODE, grouping);
    push(NARUTO_MYTHOS_KS1E2_SET_CODE, grouping);
  }
  push(setCode, grouping);
  if (grouping === "a") {
    push(NARUTO_MYTHOS_KS1E2_SET_CODE, grouping);
  }
  return keys;
}

/** Primary printKey (first candidate), or null. */
export function printKeyForNarutomythosSiteCardId(
  cardId: string,
): string | null {
  return printKeysForNarutomythosSiteCardId(cardId)[0] ?? null;
}

// ─── narutopiaMap ───────────────────────────────────────────────────────────

export type MythosNarutopiaMapped = {
  setCode: string;
  number: string;
  grouping: string | null;
  printKey: string;
  rarity: string | null;
};

/** Prefer promo / 2e éd. homes for Mythos V when resolving later. */
export function mapNarutopiaMythosHeading(
  code: string,
): MythosNarutopiaMapped | null {
  const raw = code.trim().replace(/\s+/g, " ");
  if (!raw) return null;

  if (/^legend(ray|ary)/i.test(raw)) {
    const printKey = mythosPrintKey(NARUTO_MYTHOS_KS1_SET_CODE, "lg01", null);
    if (!printKey) return null;
    return {
      setCode: NARUTO_MYTHOS_KS1_SET_CODE,
      number: "lg01",
      grouping: null,
      printKey,
      rarity: "LG",
    };
  }

  const mission = raw.match(/^mission\s*0*(\d+)$/i);
  if (mission) {
    const number = `mss${mission[1]!.padStart(2, "0")}`;
    const printKey = mythosPrintKey(NARUTO_MYTHOS_KS1_SET_CODE, number, null);
    if (!printKey) return null;
    return {
      setCode: NARUTO_MYTHOS_KS1_SET_CODE,
      number,
      grouping: null,
      printKey,
      rarity: "Mission",
    };
  }

  const mythosV = raw.match(/^mythos\s*-?\s*0*(\d+)\s*v$/i);
  if (mythosV) {
    const number = mythosV[1]!.padStart(4, "0");
    const printKey = mythosPrintKey(
      NARUTO_MYTHOS_KS1PROMO_SET_CODE,
      number,
      "v",
    );
    if (!printKey) return null;
    return {
      setCode: NARUTO_MYTHOS_KS1PROMO_SET_CODE,
      number,
      grouping: "v",
      printKey,
      rarity: "MY",
    };
  }

  const mythosPlain = raw.match(/^mythos\s*-?\s*0*(\d+)$/i);
  if (mythosPlain) {
    const number = mythosPlain[1]!.padStart(4, "0");
    // 141–148 live as MY on ks1; 145–148 also on ks1e2 — prefer ks1.
    const setCode =
      Number(number) >= 145
        ? NARUTO_MYTHOS_KS1E2_SET_CODE
        : NARUTO_MYTHOS_KS1_SET_CODE;
    const grouping = Number(number) >= 141 ? "v" : null;
    const printKey = mythosPrintKey(setCode, number, grouping);
    if (!printKey) return null;
    return {
      setCode,
      number,
      grouping,
      printKey,
      rarity: "MY",
    };
  }

  const secret = raw.match(/^secret\s*-?\s*0*(\d+)(?:\s*(v))?$/i);
  if (secret) {
    const number = secret[1]!.padStart(4, "0");
    const grouping = secret[2] ? "sv" : "s";
    const printKey = mythosPrintKey(
      NARUTO_MYTHOS_KS1_SET_CODE,
      number,
      grouping,
    );
    if (!printKey) return null;
    return {
      setCode: NARUTO_MYTHOS_KS1_SET_CODE,
      number,
      grouping,
      printKey,
      rarity: grouping === "sv" ? "SV" : "S",
    };
  }

  const rarity = raw.match(/^(C|UC|R|RA|S|SV|L)-0*(\d+)(?:\s*([A-Z]+))?$/i);
  if (rarity) {
    const letter = (rarity[1] ?? "").toUpperCase();
    const number = rarity[2]!.padStart(4, "0");
    const suffix = (rarity[3] ?? "").toUpperCase();
    let grouping: string | null = null;
    let rarityCode: string | null = letter;
    if (suffix === "A" || letter === "RA") {
      grouping = "a";
      rarityCode = "RA";
    } else if (suffix === "V") {
      grouping = "v";
    } else if (letter === "SV") {
      grouping = "sv";
    } else if (letter === "S") {
      grouping = "s";
    } else if (letter === "L") {
      grouping = "l";
    }
    const printKey = mythosPrintKey(
      NARUTO_MYTHOS_KS1_SET_CODE,
      number,
      grouping,
    );
    if (!printKey) return null;
    return {
      setCode: NARUTO_MYTHOS_KS1_SET_CODE,
      number,
      grouping,
      printKey,
      rarity: rarityCode,
    };
  }

  return null;
}

// ─── scanflipFaces ──────────────────────────────────────────────────────────

const SCANFLIP_LEDGER = "scanflip-mythos.json";
const SCANFLIP_URL = "https://www.scanflip.fr/fr/naruto-mythos/cards";

/** Explorateur Naruto Mythos sur ScanFlip — spec passée au client partagé. */
const SCANFLIP_EXPLORER: ScanflipExplorerSpec = {
  path: "/fr/naruto-mythos/cards",
  telefuncFile:
    "/components/contexts/naruto-card-explorer/NarutoCardExplorer.onSettingsUpdate.telefunc.ts",
  defaultFilters: {
    languages: ["fr_FR"],
    name: "",
    exactMatch: false,
    ownership: "ALL",
    rarities: [],
  },
};

const SCANFLIP_PREFIX_TO_SET: Record<string, string> = {
  KS: NARUTO_MYTHOS_KS1_SET_CODE,
  SS: NARUTO_MYTHOS_SS2_SET_CODE,
  AK: NARUTO_MYTHOS_AK3_SET_CODE,
};

/**
 * ScanFlip finish tiers that are **not** CICABOOM parallel printKeys.
 * CFA/UCFA = Full Art of the common/uncommon (≠ Rare Art `a`).
 * CH/UCH = Holo finish (≠ rarity CHIBI).
 * Never invent `-a` / `-chibi` from these — that minted ~200 ghost tiles.
 */
export function isScanflipFinishOnlyRarity(rarityCode: string | null): boolean {
  const r = (rarityCode ?? "").trim().toUpperCase();
  if (!r) return false;
  if (r === "CH" || r === "UCH" || r === "RH") return true;
  if (r.endsWith("FA") && r !== "RA") return true; // CFA, UCFA, RFA…
  if (r.includes("FULL")) return true;
  return false;
}

/**
 * Grouping from ScanFlip rarity / letter suffix on the printed code.
 * Official parallels only: `a` (RA / code …A), `v` (MY / …V), `sv`, `s`, `chibi`.
 */
export function groupingFromScanflipMythos(
  rarityCode: string | null,
  letterSuffix: string | null,
): string | null {
  const letter = (letterSuffix ?? "").toUpperCase();
  const r = (rarityCode ?? "").toUpperCase();
  if (letter === "A") return "a";
  if (letter === "V") {
    if (r === "SV") return "sv";
    return "v";
  }
  // Letter-less finish tiers are not catalogue parallels (see above).
  if (isScanflipFinishOnlyRarity(r)) return null;
  if (r === "RA") return "a";
  if (r === "SV") return "sv";
  if (r === "MY") return "v";
  if (r === "S") return "s";
  if (r === "CHIBI" || r === "CHIB") return "chibi";
  return null;
}

export type ScanflipMythosMapped = {
  setCode: string;
  number: string;
  grouping: string | null;
  printKey: string;
};

export function mapScanflipMythosCard(
  card: ScanflipCardRow,
): ScanflipMythosMapped | null {
  const raw = card.code.trim().toUpperCase().replace(/\s+/g, "");
  const prefixOf = (p: string) => SCANFLIP_PREFIX_TO_SET[p] ?? null;

  let m = raw.match(/^([A-Z]+)-LEG0*(\d+)$/);
  if (m) {
    const setCode = prefixOf(m[1]!);
    if (!setCode) return null;
    const number = `lg${m[2]!.padStart(2, "0")}`;
    const printKey = mythosPrintKey(setCode, number, null);
    if (!printKey) return null;
    return { setCode, number, grouping: null, printKey };
  }

  // Official CICABOOM missions are MSS01… — not M1 (SS2-only SKU shape).
  m = raw.match(/^([A-Z]+)-M0*(\d+)$/);
  if (m) {
    const setCode = prefixOf(m[1]!);
    if (!setCode) return null;
    const number = `mss${m[2]!.padStart(2, "0")}`;
    const printKey = mythosPrintKey(setCode, number, null);
    if (!printKey) return null;
    return { setCode, number, grouping: null, printKey };
  }

  m = raw.match(/^([A-Z]+)-0*(\d+)([A-Z])?$/);
  if (!m) return null;
  const setCode = prefixOf(m[1]!);
  if (!setCode) return null;
  // No letter on the code → CFA/CH are finishes, not new printKeys.
  if (!m[3] && isScanflipFinishOnlyRarity(card.rarityCode)) return null;
  const number = m[2]!.padStart(4, "0");
  const grouping = groupingFromScanflipMythos(card.rarityCode, m[3] ?? null);
  const printKey = mythosPrintKey(setCode, number, grouping);
  if (!printKey) return null;
  return { setCode, number, grouping, printKey };
}

/**
 * Prefer official set homes (promos / 2e éd.) before a bare ks1 parallel.
 */
export function resolveScanflipMythosAgainstIndex(
  mapped: ScanflipMythosMapped,
  index: LocalPrintsIndex,
): ScanflipMythosMapped | null {
  const candidates: ScanflipMythosMapped[] = [];
  const push = (
    setCode: string,
    number: string,
    grouping: string | null,
  ) => {
    const printKey = mythosPrintKey(setCode, number, grouping);
    if (!printKey) return;
    if (candidates.some((c) => c.printKey === printKey)) return;
    candidates.push({ setCode, number, grouping, printKey });
  };

  if (mapped.grouping === "v" || mapped.grouping === "sv") {
    push(NARUTO_MYTHOS_KS1PROMO_SET_CODE, mapped.number, mapped.grouping);
    push(NARUTO_MYTHOS_KS1E2_SET_CODE, mapped.number, mapped.grouping);
  }
  push(mapped.setCode, mapped.number, mapped.grouping);

  for (const c of candidates) {
    if (index.lookupRow(c.printKey)) return c;
  }
  return null;
}

export function mythosScanflipTitle(card: ScanflipCardRow): string {
  const name = card.name.trim();
  const version = card.version?.trim();
  if (version) return `${name} — ${version}`;
  return name;
}

export function mythosScanflipLedgerPath(): string {
  return path.join(narutoMythosCuratedDir(), "sources", SCANFLIP_LEDGER);
}

export async function harvestMythosScanflip(opts: {
  maxPages?: number;
} = {}): Promise<{ cards: number; path: string }> {
  const { cards } = await harvestScanflipCards(SCANFLIP_EXPLORER, {
    maxPages: opts.maxPages ?? 2,
  });
  const out = mythosScanflipLedgerPath();
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        source: "scanflip.fr/fr/naruto-mythos/cards",
        lang: "fr",
        observed: new Date().toISOString().slice(0, 10),
        count: cards.length,
        cards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { cards: cards.length, path: out };
}

function loadScanflipLedger(): ScanflipCardRow[] {
  const p = mythosScanflipLedgerPath();
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8")) as {
    cards?: ScanflipCardRow[];
  };
  return raw.cards ?? [];
}

/**
 * Install ScanFlip faces onto known Mythos printKeys (official / ledger).
 * Does **not** mint missing CFA/chibi — those belong on CICABOOM if attested.
 */
export async function installMythosScanflipFaces(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean; force?: boolean } = {},
): Promise<{
  faces: number;
  matched: number;
  minted: number;
  skipped: number;
}> {
  const cards = loadScanflipLedger();
  const assets: LocalPrintAssetWrite[] = [];
  let faces = 0;
  let matched = 0;
  let skipped = 0;

  for (const card of cards) {
    const mapped = mapScanflipMythosCard(card);
    if (!mapped) {
      skipped += 1;
      continue;
    }
    const resolved = resolveScanflipMythosAgainstIndex(mapped, index);
    if (!resolved) {
      skipped += 1;
      continue;
    }
    const { printKey, setCode, number, grouping } = resolved;
    matched += 1;

    const faceUrl = scanflipFaceUrl(card);
    if (opts.downloadFaces === false || !faceUrl) continue;

    const destDir = packCardDir(NARUTO_MYTHOS_PACK_ID, {
      set: setCode,
      lang: "fr",
      card: grouping ? `${number}-${grouping}` : number,
    });
    const artName = "art.scanflip.webp";
    const installed = await installCardFace({
      destDir,
      artName,
      url: faceUrl,
      force: opts.force,
      webpQuality: 88,
      referer: SCANFLIP_URL,
    });
    if (!installed) continue;
    if (installed.downloaded) faces += 1;
    assets.push({
      printKey,
      lang: "fr",
      art: installed.art,
      sourceUrl: faceUrl,
    });
  }

  if (assets.length) index.writeAssets(assets);
  return { faces, matched, minted: 0, skipped };
}

// ─── siteFaces ──────────────────────────────────────────────────────────────

export const NARUTOMYTHOS_CARDS_API =
  "https://www.narutomythos.com/api/cards";
export const NARUTOMYTHOS_STORAGE_ORIGIN =
  "https://www.narutomythos.com/storage";
export const NARUTOMYTHOS_CARDS_PAGE =
  "https://www.narutomythos.com/fr/cards";

const SITE_LEDGER = "narutomythos-cards-ledger.json";
const SITE_SOURCE_ID = "narutomythos";
const SITE_ART_NAME = `art.${SITE_SOURCE_ID}.webp`;

export type NarutomythosSiteCard = {
  id: string;
  nameEn?: string | null;
  nameFr?: string | null;
  imageUrl?: string | null;
  imageUrlFr?: string | null;
  rarity?: string | null;
  set?: string | null;
  cardNumber?: number | null;
};

export type NarutomythosSiteLedgerCard = NarutomythosSiteCard & {
  faceEn: string | null;
  faceFr: string | null;
};

export function mythosNarutomythosLedgerPath(): string {
  return path.join(narutoMythosCuratedDir(), "sources", SITE_LEDGER);
}

export function narutomythosStorageUrl(
  relative: string | null | undefined,
): string | null {
  const rel = relative?.trim().replace(/^\/+/, "") ?? "";
  if (!rel) return null;
  return `${NARUTOMYTHOS_STORAGE_ORIGIN}/${rel}`;
}

export function resolveNarutomythosSiteCardAgainstIndex(
  cardId: string,
  index: LocalPrintsIndex,
): { printKey: string; setCode: string; number: string; grouping: string | null } | null {
  for (const printKey of printKeysForNarutomythosSiteCardId(cardId)) {
    if (!index.lookupRow(printKey)) continue;
    const id = parsePrintKey(printKey);
    if (!id) continue;
    return {
      printKey,
      setCode: id.set,
      number: id.number,
      grouping: id.grouping ?? null,
    };
  }
  return null;
}

function preferredSiteArtInDir(destDir: string): string | null {
  for (const name of [
    // HD watermark-free site faces beat low-res CICABOOM CDN when both exist.
    SITE_ART_NAME,
    "art.official.webp",
    "art.webp",
    "art.lorenzone.webp",
    "art.narutopia.webp",
    "art.scanflip.webp",
  ]) {
    if (existsSync(path.join(destDir, name))) return name;
  }
  return null;
}

export async function harvestMythosNarutomythosSite(opts: {
  cards?: readonly NarutomythosSiteCard[];
} = {}): Promise<{ cards: number; path: string }> {
  let cards: NarutomythosSiteCard[] = opts.cards ? [...opts.cards] : [];
  if (!opts.cards) {
    const res = await httpGet<{ data?: NarutomythosSiteCard[] }>(
      NARUTOMYTHOS_CARDS_API,
      {
        headers: { "User-Agent": MYTHOS_HARVEST_UA, Accept: "application/json" },
        timeout: 60_000,
        validateStatus: (s) => s === 200,
      },
    );
    const data = res.data?.data;
    cards = Array.isArray(data) ? data : [];
  }

  const ledgerCards: NarutomythosSiteLedgerCard[] = [];
  for (const card of cards) {
    const id = card.id?.trim() ?? "";
    if (!id) continue;
    ledgerCards.push({
      id,
      nameEn: card.nameEn ?? null,
      nameFr: card.nameFr ?? null,
      imageUrl: card.imageUrl ?? null,
      imageUrlFr: card.imageUrlFr ?? null,
      rarity: card.rarity ?? null,
      set: card.set ?? null,
      cardNumber: card.cardNumber ?? null,
      faceEn: narutomythosStorageUrl(card.imageUrl),
      faceFr: narutomythosStorageUrl(card.imageUrlFr),
    });
  }

  const out = mythosNarutomythosLedgerPath();
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        source: "narutomythos.com/api/cards",
        url: NARUTOMYTHOS_CARDS_PAGE,
        observed: new Date().toISOString().slice(0, 10),
        note: "Faces sans watermark — art.narutomythos.webp sur printKeys existants uniquement",
        count: ledgerCards.length,
        cards: ledgerCards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { cards: ledgerCards.length, path: out };
}

function loadSiteLedger(): NarutomythosSiteLedgerCard[] {
  const p = mythosNarutomythosLedgerPath();
  if (!existsSync(p)) return [];
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as {
      cards?: NarutomythosSiteLedgerCard[];
    };
    return Array.isArray(raw.cards) ? raw.cards : [];
  } catch {
    return [];
  }
}

async function installSiteLangFace(input: {
  printKey: string;
  setCode: string;
  number: string;
  grouping: string | null;
  lang: "fr" | "en";
  faceUrl: string | null;
  downloadFaces: boolean;
  force: boolean;
  assets: LocalPrintAssetWrite[];
}): Promise<boolean> {
  const {
    printKey,
    setCode,
    number,
    grouping,
    lang,
    faceUrl,
    downloadFaces,
    force,
    assets,
  } = input;
  if (!faceUrl) return false;

  const destDir = packCardDir(NARUTO_MYTHOS_PACK_ID, {
    set: setCode,
    lang,
    card: grouping ? `${number}-${grouping}` : number,
  });

  if (!downloadFaces) {
    const preferred = preferredSiteArtInDir(destDir);
    if (preferred) {
      assets.push({
        printKey,
        lang,
        art: preferred,
        sourceUrl: faceUrl,
      });
    }
    return false;
  }

  const installed = await installCardFace({
    destDir,
    artName: SITE_ART_NAME,
    url: faceUrl,
    force,
    webpQuality: 90,
    referer: NARUTOMYTHOS_CARDS_PAGE,
  });
  if (!installed) return false;
  assets.push({
    printKey,
    lang,
    art: installed.art,
    sourceUrl: faceUrl,
  });
  return installed.downloaded;
}

/**
 * Install clean fan faces onto known Mythos printKeys only.
 * Prefer over ScanFlip when no CICABOOM official art is present.
 */
export async function installMythosNarutomythosSiteFaces(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean; force?: boolean } = {},
): Promise<{ faces: number; matched: number; skipped: number }> {
  const cards = loadSiteLedger();
  const assets: LocalPrintAssetWrite[] = [];
  let faces = 0;
  let matched = 0;
  let skipped = 0;
  const downloadFaces = opts.downloadFaces !== false;
  const force = Boolean(opts.force);

  for (const card of cards) {
    const resolved = resolveNarutomythosSiteCardAgainstIndex(card.id, index);
    if (!resolved) {
      skipped += 1;
      continue;
    }
    matched += 1;

    const wroteFr = await installSiteLangFace({
      ...resolved,
      lang: "fr",
      faceUrl: card.faceFr ?? card.faceEn,
      downloadFaces,
      force,
      assets,
    });
    const wroteEn = await installSiteLangFace({
      ...resolved,
      lang: "en",
      faceUrl: card.faceEn ?? card.faceFr,
      downloadFaces,
      force,
      assets,
    });
    if (wroteFr) faces += 1;
    if (wroteEn) faces += 1;
  }

  if (assets.length) index.writeAssets(assets);
  return { faces, matched, skipped };
}

// ─── officialFaces ──────────────────────────────────────────────────────────

const OFFICIAL_API = "https://cards.narutotcgmythos.com/api/cards";
const OFFICIAL_STAGING_FOLDER = "official-faces";
const OFFICIAL_SOURCE_ID = "official";
const OFFICIAL_LANGS = ["fr", "en"] as const;

export function mythosOfficialFacesStagingDir(): string {
  return path.join(packStagingDir(NARUTO_MYTHOS_PACK_ID), OFFICIAL_STAGING_FOLDER);
}

function officialDiskCard(print: MythosOfficialPrint): string {
  const g = print.grouping?.trim().toLowerCase();
  return g ? `${print.number}-${g}` : print.number;
}

function officialStagingName(print: MythosOfficialPrint): string {
  return `${print.setCode}-${officialDiskCard(print)}.bin`;
}

function titleLangForSet(setCode: string): string {
  return setCode === "ss2" ? "en" : "fr";
}

async function officialToWebp(buf: Buffer): Promise<Buffer> {
  return sharp(buf).rotate().webp({ quality: 90 }).toBuffer();
}

export async function fetchOfficialMythosPrints(): Promise<
  MythosOfficialPrint[]
> {
  const byLang: Record<
    string,
    ReturnType<typeof parseOfficialMythosApiPayload>
  > = {};
  for (const lang of OFFICIAL_LANGS) {
    try {
      const res = await httpGet<unknown>(`${OFFICIAL_API}?lang=${lang}`, {
        headers: { "User-Agent": MYTHOS_HARVEST_UA, Accept: "application/json" },
        timeout: 60_000,
        validateStatus: (s: number) => s === 200,
      });
      byLang[lang] = parseOfficialMythosApiPayload(res.data);
    } catch {
      byLang[lang] = [];
    }
  }
  return mergeOfficialMythosLangRows(byLang, "fr");
}

export function writeOfficialMythosChecklist(
  prints: readonly MythosOfficialPrint[],
): string {
  const bySet = new Map<string, MythosOfficialPrint[]>();
  for (const p of prints) {
    const list = bySet.get(p.setCode) ?? [];
    list.push(p);
    bySet.set(p.setCode, list);
  }
  const payload = {
    source: "cards.narutotcgmythos.com — gallery API officielle CICABOOM",
    url: "https://www.narutotcgmythos.com/fr/galerie",
    api: `${OFFICIAL_API}?lang=fr`,
    observed: new Date().toISOString().slice(0, 10),
    ingest: "art.official.webp — faces CDN cards.narutotcgmythos.com/storage",
    cards: prints.length,
    sets: [...bySet.entries()].map(([code, rows]) => ({
      code,
      label: rows[0]?.setLabel || code,
      cards: rows.map((c) => ({
        printed: c.printed,
        number: c.number,
        grouping: c.grouping,
        name: c.name,
        titles: c.titles,
        rarity: c.rarity,
        faceUrl: c.faceUrl,
        sku: c.sku,
        edition: c.edition || null,
      })),
    })),
  };
  const dest = mythosOfficialChecklistPath();
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(payload, null, 2)}\n`);
  return dest;
}

export function readOfficialMythosChecklist(): MythosOfficialPrint[] {
  const p = mythosOfficialChecklistPath();
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8")) as {
    sets?: {
      code: string;
      label?: string;
      cards: {
        printed: string;
        number: string;
        grouping: string | null;
        name: string;
        titles?: { lang: string; fullName: string }[];
        rarity: string | null;
        faceUrl?: string | null;
        sku?: string;
        edition?: string | null;
      }[];
    }[];
  };
  const out: MythosOfficialPrint[] = [];
  for (const set of raw.sets ?? []) {
    for (const c of set.cards) {
      out.push({
        sku: c.sku ?? `${set.code}-${c.number}`,
        uid: null,
        setCode: set.code,
        number: c.number,
        grouping: c.grouping,
        printed: c.printed,
        name: c.name,
        titles: c.titles?.length
          ? c.titles
          : c.name
            ? [{ lang: titleLangForSet(set.code), fullName: c.name }]
            : [],
        rarity: c.rarity,
        faceUrl: c.faceUrl ?? null,
        edition: c.edition ?? "",
        setLabel: set.label ?? set.code,
        order: null,
      });
    }
  }
  return out;
}

async function downloadOfficialImage(url: string): Promise<Buffer | null> {
  return downloadCardFaceBytes(url, {
    referer: "https://www.narutotcgmythos.com/",
    minBytes: 500,
    timeoutMs: 40_000,
  });
}

export type OfficialFaceHarvest = {
  cards: number;
  ok: number;
  skip: number;
  fail: number;
  checklistPath: string;
};

export async function harvestOfficialMythosFaces(
  opts: {
    force?: boolean;
    stagingDir?: string;
    prints?: MythosOfficialPrint[];
  } = {},
): Promise<OfficialFaceHarvest> {
  const prints = opts.prints ?? (await fetchOfficialMythosPrints());
  const checklistPath = writeOfficialMythosChecklist(prints);
  const staging = opts.stagingDir ?? mythosOfficialFacesStagingDir();
  mkdirSync(staging, { recursive: true });

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const print of prints) {
    const dest = path.join(staging, officialStagingName(print));
    if (!print.faceUrl) {
      skip += 1;
      continue;
    }
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    const buf = await downloadOfficialImage(print.faceUrl);
    if (!buf) {
      fail += 1;
    } else {
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, buf);
      ok += 1;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  return { cards: prints.length, ok, skip, fail, checklistPath };
}

export type OfficialFaceInstall = { faces: number; missing: string[] };

export async function installOfficialMythosFaces(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string; prints?: MythosOfficialPrint[] } = {},
): Promise<OfficialFaceInstall> {
  const prints = opts.prints ?? readOfficialMythosChecklist();
  const staging = opts.stagingDir ?? mythosOfficialFacesStagingDir();
  const missing: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string;
  }[] = [];

  for (const print of prints) {
    const from = path.join(staging, officialStagingName(print));
    if (!existsSync(from)) {
      missing.push(`${print.setCode}:${print.printed}`);
      continue;
    }
    const printKey = mythosPrintKey(
      print.setCode,
      print.number,
      print.grouping,
    );
    if (!printKey) {
      missing.push(`${print.setCode}:${print.printed}`);
      continue;
    }
    const lang = titleLangForSet(print.setCode);
    const destDir = path.join(
      packCardsDir(NARUTO_MYTHOS_PACK_ID),
      print.setCode,
      lang,
      officialDiskCard(print),
    );
    mkdirSync(destDir, { recursive: true });
    const art = `art.${OFFICIAL_SOURCE_ID}.webp`;
    const dest = path.join(destDir, art);
    const raw = readFileSync(from);
    const webp =
      raw.length >= 12 &&
      raw.toString("ascii", 0, 4) === "RIFF" &&
      raw.toString("ascii", 8, 12) === "WEBP"
        ? raw
        : await officialToWebp(raw);
    writeFileSync(dest, webp);
    assets.push({
      printKey,
      lang,
      art,
      sourceUrl: print.faceUrl ?? OFFICIAL_API,
    });
  }

  if (assets.length) index.writeAssets(assets);
  return { faces: assets.length, missing };
}

// ─── narutopiaFaces ─────────────────────────────────────────────────────────

export const NARUTOPIA_MYTHOS_S1_URL =
  "https://narutopia.fr/liste-des-cartes-naruto-mythos-serie-1/";

const NARUTOPIA_LEDGER = "narutopia-mythos-s1.json";

export type NarutopiaMythosLedgerCard = {
  heading: string;
  code: string;
  faceUrl: string | null;
  setCode: string;
  number: string;
  grouping: string | null;
  printKey: string;
  rarity: string | null;
};

export function mythosNarutopiaLedgerPath(): string {
  return path.join(narutoMythosCuratedDir(), "sources", NARUTOPIA_LEDGER);
}

export async function harvestMythosNarutopia(opts: {
  url?: string;
} = {}): Promise<{ cards: number; path: string }> {
  const url = opts.url ?? NARUTOPIA_MYTHOS_S1_URL;
  const res = await httpGet<string>(url, {
    headers: { "User-Agent": MYTHOS_HARVEST_UA, Accept: "text/html" },
    timeout: 90_000,
  });
  const entries = parseNarutopiaChecklistHtml(String(res.data));
  const cards: NarutopiaMythosLedgerCard[] = [];
  for (const entry of entries) {
    const code = entry.code?.trim();
    if (!code) continue;
    const mapped = mapNarutopiaMythosHeading(code);
    if (!mapped) continue;
    cards.push({
      heading: entry.heading,
      code,
      faceUrl: entry.faceUrl,
      setCode: mapped.setCode,
      number: mapped.number,
      grouping: mapped.grouping,
      printKey: mapped.printKey,
      rarity: mapped.rarity,
    });
  }
  const out = mythosNarutopiaLedgerPath();
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        source: url,
        lang: "fr",
        observed: new Date().toISOString().slice(0, 10),
        count: cards.length,
        cards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { cards: cards.length, path: out };
}

function loadNarutopiaLedger(): NarutopiaMythosLedgerCard[] {
  const p = mythosNarutopiaLedgerPath();
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8")) as {
    cards?: NarutopiaMythosLedgerCard[];
  };
  return raw.cards ?? [];
}

function resolveNarutopiaAgainstIndex(
  card: NarutopiaMythosLedgerCard,
  index: LocalPrintsIndex,
): NarutopiaMythosLedgerCard | null {
  const candidates: Array<{
    setCode: string;
    number: string;
    grouping: string | null;
  }> = [
    {
      setCode: card.setCode,
      number: card.number,
      grouping: card.grouping,
    },
  ];
  if (card.grouping === "v" || card.grouping === "sv") {
    for (const setCode of [
      NARUTO_MYTHOS_KS1PROMO_SET_CODE,
      NARUTO_MYTHOS_KS1E2_SET_CODE,
      card.setCode,
    ]) {
      candidates.push({
        setCode,
        number: card.number,
        grouping: card.grouping,
      });
    }
  }
  for (const c of candidates) {
    const printKey = mythosPrintKey(c.setCode, c.number, c.grouping);
    if (printKey && index.lookupRow(printKey)) {
      return { ...card, ...c, printKey };
    }
  }
  return null;
}

/** Install Narutopia faces onto existing Mythos printKeys only. */
export async function installMythosNarutopiaFaces(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean; force?: boolean } = {},
): Promise<{ faces: number; matched: number; skipped: number }> {
  const cards = loadNarutopiaLedger();
  const assets: LocalPrintAssetWrite[] = [];
  let faces = 0;
  let matched = 0;
  let skipped = 0;

  for (const card of cards) {
    const resolved = resolveNarutopiaAgainstIndex(card, index);
    if (!resolved) {
      skipped += 1;
      continue;
    }
    matched += 1;
    if (opts.downloadFaces === false || !resolved.faceUrl) continue;

    const destDir = packCardDir(NARUTO_MYTHOS_PACK_ID, {
      set: resolved.setCode,
      lang: "fr",
      card: resolved.grouping
        ? `${resolved.number}-${resolved.grouping}`
        : resolved.number,
    });
    const artName = "art.narutopia.webp";
    const installed = await installCardFace({
      destDir,
      artName,
      url: resolved.faceUrl,
      force: opts.force,
      webpQuality: 88,
      referer: NARUTOPIA_MYTHOS_S1_URL,
    });
    if (!installed) continue;
    if (installed.downloaded) faces += 1;
    assets.push({
      printKey: resolved.printKey,
      lang: "fr",
      art: installed.art,
      sourceUrl: resolved.faceUrl,
    });
  }

  if (assets.length) index.writeAssets(assets);
  return { faces, matched, skipped };
}

// ─── lorenzoneFaces ─────────────────────────────────────────────────────────

const LORENZONE_STAGING_FOLDER = "lorenzone-faces";
const LORENZONE_SOURCE_ID = "lorenzone";

export function mythosFacesStagingDir(): string {
  return path.join(packStagingDir(NARUTO_MYTHOS_PACK_ID), LORENZONE_STAGING_FOLDER);
}

/** Prefixed by set — bare `0001.webp` must never satisfy SS2. */
function lorenzoneStagingStem(setCode: string, card: MythosChecklistCard): string {
  const set = setCode.trim().toLowerCase() || NARUTO_MYTHOS_KS1_SET_CODE;
  const g = card.grouping?.trim().toLowerCase();
  const n = card.number.trim().toLowerCase();
  return g ? `${set}-${n}-${g}` : `${set}-${n}`;
}

function lorenzoneStagingName(setCode: string, card: MythosChecklistCard): string {
  return `${lorenzoneStagingStem(setCode, card)}.bin`;
}

function lorenzoneDiskCard(card: MythosChecklistCard): string {
  const g = card.grouping?.trim().toLowerCase();
  const n = card.number.trim().toLowerCase();
  return g ? `${n}-${g}` : n;
}

async function downloadLorenzoneImage(
  url: string,
  referer: string,
): Promise<Buffer | null> {
  return downloadCardFaceBytes(url, {
    referer,
    minBytes: 500,
    timeoutMs: 40_000,
  });
}

/** Shopify often serves PNG/JPEG; always persist real WebP under `.webp`. */
export async function mythosFaceToWebp(buf: Buffer): Promise<Buffer> {
  return sharp(buf).rotate().webp({ quality: 90 }).toBuffer();
}

function isRealWebp(buf: Buffer): boolean {
  return (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  );
}

function resolveLorenzoneStagingFile(
  staging: string,
  setCode: string,
  card: MythosChecklistCard,
): string | null {
  const set = setCode.trim().toLowerCase() || NARUTO_MYTHOS_KS1_SET_CODE;
  const preferred = path.join(staging, lorenzoneStagingName(set, card));
  if (existsSync(preferred)) return preferred;
  const setWebp = path.join(staging, `${lorenzoneStagingStem(set, card)}.webp`);
  if (existsSync(setWebp)) return setWebp;
  // Pre-set-prefix KS1 only.
  if (set === NARUTO_MYTHOS_KS1_SET_CODE) {
    const g = card.grouping?.trim().toLowerCase();
    const n = card.number.trim().toLowerCase();
    const bare = g ? `${n}-${g}` : n;
    for (const name of [`${bare}.bin`, `${bare}.webp`]) {
      const p = path.join(staging, name);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

export type MythosFaceHarvest = {
  cards: number;
  ok: number;
  skip: number;
  fail: number;
};

export async function harvestMythosFaces(
  opts: { force?: boolean; stagingDir?: string } = {},
): Promise<MythosFaceHarvest> {
  const ledgers = readAllMythosChecklists();
  const staging = opts.stagingDir ?? mythosFacesStagingDir();
  mkdirSync(staging, { recursive: true });

  let cards = 0;
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const ledger of ledgers) {
    const setCode =
      ledger.set?.code?.trim().toLowerCase() || NARUTO_MYTHOS_KS1_SET_CODE;
    for (const card of ledger.cards) {
      cards += 1;
      const url = card.faceUrl?.trim();
      if (!url) {
        skip += 1;
        continue;
      }
      const dest = path.join(staging, lorenzoneStagingName(setCode, card));
      if (
        !opts.force &&
        (existsSync(dest) || resolveLorenzoneStagingFile(staging, setCode, card))
      ) {
        skip += 1;
        continue;
      }
      const buf = await downloadLorenzoneImage(url, ledger.url);
      if (!buf) {
        fail += 1;
      } else {
        writeFileSync(dest, buf);
        ok += 1;
      }
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  return { cards, ok, skip, fail };
}

export type MythosFaceInstall = { faces: number; missing: string[] };

export async function installMythosFaces(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): Promise<MythosFaceInstall> {
  const ledgers = readAllMythosChecklists();
  const staging = opts.stagingDir ?? mythosFacesStagingDir();
  const missing: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string;
  }[] = [];

  if (!existsSync(staging)) {
    return {
      faces: 0,
      missing: ledgers.flatMap((l) =>
        l.cards.filter((c) => c.faceUrl).map((c) => c.printed),
      ),
    };
  }

  for (const ledger of ledgers) {
    const setCode =
      ledger.set?.code?.trim().toLowerCase() || NARUTO_MYTHOS_KS1_SET_CODE;
    const lang =
      setCode === NARUTO_MYTHOS_KS1_SET_CODE ? MYTHOS_TITLE_LANG : "en";
    for (const card of ledger.cards) {
      if (!card.faceUrl) continue;
      const from = resolveLorenzoneStagingFile(staging, setCode, card);
      if (!from) {
        missing.push(card.printed);
        continue;
      }
      const grouping = card.grouping?.trim().toLowerCase() || null;
      const printKey = mythosPrintKey(setCode, card.number, grouping);
      if (!printKey) {
        missing.push(card.printed);
        continue;
      }
      const destDir = path.join(
        packCardsDir(NARUTO_MYTHOS_PACK_ID),
        setCode,
        lang,
        lorenzoneDiskCard(card),
      );
      mkdirSync(destDir, { recursive: true });
      const art = `art.${LORENZONE_SOURCE_ID}.webp`;
      const dest = path.join(destDir, art);
      try {
        const raw = readFileSync(from);
        writeFileSync(
          dest,
          isRealWebp(raw) ? raw : await mythosFaceToWebp(raw),
        );
      } catch {
        missing.push(card.printed);
        continue;
      }
      assets.push({
        printKey,
        lang,
        art,
        sourceUrl: card.faceUrl,
      });
    }
  }

  if (assets.length) index.writeAssets(assets);
  return { faces: assets.length, missing };
}

/** One-shot: re-encode on-disk `art.*.webp` that are still PNG/JPEG bytes. */
export async function reencodeMythosDiskFaces(opts: {
  cardsRoot?: string;
} = {}): Promise<{ converted: number; skipped: number; failed: number }> {
  const root = opts.cardsRoot ?? packCardsDir(NARUTO_MYTHOS_PACK_ID);
  let converted = 0;
  let skipped = 0;
  let failed = 0;
  const files: string[] = [];

  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/^art\..+\.webp$/i.test(name)) files.push(p);
    }
  };
  walk(root);

  for (const file of files) {
    try {
      const raw = readFileSync(file);
      if (isRealWebp(raw)) {
        skipped += 1;
        continue;
      }
      writeFileSync(file, await mythosFaceToWebp(raw));
      converted += 1;
    } catch {
      failed += 1;
    }
  }
  return { converted, skipped, failed };
}
