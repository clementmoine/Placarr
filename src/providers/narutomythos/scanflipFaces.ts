/**
 * ScanFlip Mythos → faces on **existing** official printKeys only.
 *
 * Catalogue identity comes from CICABOOM (+ LorenZone supplement). ScanFlip
 * never invents CFA/CH finish rows as `-a`/`-chibi` (those are Full Art / Holo,
 * not Rare Art / CHIBI). Missions map to `mss*`; Mythos V resolves to
 * `ks1promo` when that key already exists.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { packCardDir } from "@/lib/packPaths";
import { installCardFace } from "@/providers/shared/cardCatalogue/faceInstall";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";
import {
  harvestScanflipCards,
  scanflipFaceUrl,
  type ScanflipCardRow,
  type ScanflipExplorerSpec,
} from "@/providers/shared/scanflip/client";

import {
  NARUTO_MYTHOS_KS1E2_SET_CODE,
  NARUTO_MYTHOS_KS1PROMO_SET_CODE,
} from "./parseOfficialCards";
import { narutoMythosCuratedDir, NARUTO_MYTHOS_PACK_ID } from "./pack";
import {
  NARUTO_MYTHOS_AK3_SET_CODE,
  NARUTO_MYTHOS_KS1_SET_CODE,
  NARUTO_MYTHOS_SS2_SET_CODE,
  mythosPrintKey,
} from "./printKey";

const LEDGER = "scanflip-mythos.json";
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

const PREFIX_TO_SET: Record<string, string> = {
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
  const prefixOf = (p: string) => PREFIX_TO_SET[p] ?? null;

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
  return path.join(narutoMythosCuratedDir(), "sources", LEDGER);
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

function loadLedger(): ScanflipCardRow[] {
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
  const cards = loadLedger();
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
