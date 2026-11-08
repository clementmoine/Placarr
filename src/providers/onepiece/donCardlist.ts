/**
 * DON!! corpus from the official Bandai `don-cardlist.pdf` extract.
 *
 * punk-records / vegapull omit category `Don`. Identity = PDF order
 * (`DON-NNN` → `onepiece:don-NNN`) + product caption under each face.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { toLosslessWebp } from "@/lib/media/losslessWebp";
import { cardDiskIdFromPrintKey } from "@/lib/packAssetUrls";
import { packCardDir, packStagingDir } from "@/lib/packPaths";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
  LocalPrintWrite,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { ONEPIECE_PACK_ID } from "./pack";
import {
  formatOnepieceReference,
  onepiecePrintKey,
} from "./printIdentity";

const SOURCE_ID = "don-cardlist";
const SOURCE_URL = "https://www.onepiece-cardgame.com/pdf/don-cardlist.pdf";
const EXTRACT_FOLDER = "don-cardlist-extract";

export type DonCardlistEntry = {
  donIndex: number;
  page: number;
  slot: number;
  labelJa: string | null;
  productCode: string | null;
  file: string | null;
  sha256?: string;
  width?: number;
  height?: number;
};

export type DonCardlistLedger = {
  sourcePdf?: string;
  sourceUrl?: string;
  uniqueCards: number;
  cards: DonCardlistEntry[];
};

export function onepieceDonExtractDir(): string {
  return path.join(packStagingDir(ONEPIECE_PACK_ID), EXTRACT_FOLDER);
}

export function loadDonCardlistLedger(
  extractDir?: string,
): DonCardlistLedger | null {
  const root = extractDir ?? onepieceDonExtractDir();
  const ledgerPath = path.join(root, "ledger.json");
  if (!existsSync(ledgerPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(ledgerPath, "utf8")) as unknown;
    if (!raw || typeof raw !== "object") return null;
    const cards = (raw as { cards?: unknown }).cards;
    if (!Array.isArray(cards)) return null;
    return raw as DonCardlistLedger;
  } catch {
    return null;
  }
}

/** `PRB-01` / `OP14` / `ST-10` → `prb01` / `op14` / `st10` for print_sets. */
export function normalizeDonProductSetCode(
  productCode: string | null | undefined,
): string | null {
  const raw = productCode?.trim();
  if (!raw) return null;
  const compact = raw.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
  return compact || null;
}

export function donCollectorId(donIndex: number): string {
  if (!Number.isInteger(donIndex) || donIndex < 1) {
    throw new Error(`invalid donIndex: ${donIndex}`);
  }
  return `DON-${String(donIndex).padStart(3, "0")}`;
}

function enTitle(entry: DonCardlistEntry): string {
  const code = entry.productCode?.trim();
  return code ? `DON!! (${code})` : "DON!!";
}

export function buildDonCardlistPrintWrites(
  ledger: DonCardlistLedger,
): LocalPrintWrite[] {
  const writes: LocalPrintWrite[] = [];
  for (const entry of ledger.cards) {
    if (!entry || typeof entry.donIndex !== "number") continue;
    const collector = donCollectorId(entry.donIndex);
    const printKey = onepiecePrintKey(collector);
    if (!printKey) continue;
    const productSet = normalizeDonProductSetCode(entry.productCode);
    const setCodes = productSet ? (["don", productSet] as const) : undefined;
    const label = entry.labelJa?.trim() || null;
    const titles: LocalPrintWrite["titles"] = [
      {
        lang: "ja",
        fullName: label || "ドン!!",
        rarity: entry.productCode ?? "DON!!",
      },
      {
        lang: "en",
        fullName: enTitle(entry),
        rarity: entry.productCode ?? "DON!!",
      },
      {
        lang: "fr",
        fullName: enTitle(entry),
        rarity: entry.productCode ?? "DON!!",
      },
    ];
    writes.push({
      printKey,
      setCode: "don",
      number: String(entry.donIndex).padStart(3, "0"),
      cardType: "don",
      grouping: null,
      setCodes,
      category: "DON!!",
      sourceUrl: ledger.sourceUrl ?? SOURCE_URL,
      titles,
    });
  }
  return writes.sort((a, b) => a.printKey.localeCompare(b.printKey));
}

export function seedOnepieceDonFromCardlist(
  index: LocalPrintsIndex,
  opts: { extractDir?: string } = {},
): { prints: number; titles: number; skipped: boolean } {
  const ledger = loadDonCardlistLedger(opts.extractDir);
  if (!ledger?.cards?.length) return { prints: 0, titles: 0, skipped: true };
  const writes = buildDonCardlistPrintWrites(ledger);
  if (!writes.length) return { prints: 0, titles: 0, skipped: true };
  const result = index.writePrints(writes);
  return {
    prints: result.prints,
    titles: result.titles,
    skipped: false,
  };
}

export type DonFacesInstall = {
  faces: number;
  skip: number;
  fail: number;
};

/**
 * Pose `art.don-cardlist.webp` from the local PDF extract (ja + mirrored en/fr).
 */
export async function installOnepieceDonCardlistFaces(
  index: LocalPrintsIndex,
  opts: { extractDir?: string; force?: boolean } = {},
): Promise<DonFacesInstall> {
  const extractDir = opts.extractDir ?? onepieceDonExtractDir();
  const ledger = loadDonCardlistLedger(extractDir);
  if (!ledger?.cards?.length) return { faces: 0, skip: 0, fail: 0 };

  let faces = 0;
  let skip = 0;
  let fail = 0;
  const assets: LocalPrintAssetWrite[] = [];
  const langs = ["ja", "en", "fr"] as const;

  for (const entry of ledger.cards) {
    if (!entry.file || !entry.donIndex) {
      fail += 1;
      continue;
    }
    const src = path.join(extractDir, entry.file);
    if (!existsSync(src)) {
      fail += 1;
      continue;
    }
    const printKey = onepiecePrintKey(donCollectorId(entry.donIndex));
    if (!printKey) {
      fail += 1;
      continue;
    }

    let webp: Buffer;
    try {
      webp = await toLosslessWebp(readFileSync(src));
    } catch {
      fail += 1;
      continue;
    }

    for (const lang of langs) {
      const disk = cardDiskIdFromPrintKey(printKey, lang);
      if (!disk) {
        fail += 1;
        continue;
      }
      // Contrat universel : cards/{lang}/{set}/{card}/ (pas set/lang).
      const destDir = packCardDir(ONEPIECE_PACK_ID, disk);
      mkdirSync(destDir, { recursive: true });
      const art = `art.${SOURCE_ID}.webp`;
      const dest = path.join(destDir, art);
      if (!opts.force && existsSync(dest)) {
        skip += 1;
        assets.push({
          printKey,
          lang,
          art,
          sourceUrl: ledger.sourceUrl ?? SOURCE_URL,
        });
        continue;
      }
      writeFileSync(dest, webp);
      faces += 1;
      assets.push({
        printKey,
        lang,
        art,
        sourceUrl: ledger.sourceUrl ?? SOURCE_URL,
      });
    }
  }

  if (assets.length) index.writeAssets(assets);
  return { faces, skip, fail };
}

/** Keep a durable copy of the extract script output reference for Sync logs. */
export function donCardlistReference(entry: DonCardlistEntry): string {
  return formatOnepieceReference("don", String(entry.donIndex).padStart(3, "0"));
}

/** Test helper — copy a fixture jpeg into extract layout. */
export function ensureDonExtractFixtureCopy(
  fromFile: string,
  toRel: string,
  extractDir = onepieceDonExtractDir(),
): void {
  const dest = path.join(extractDir, toRel);
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(fromFile, dest);
}
