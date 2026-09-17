/**
 * Faces narutomythos.com (sans watermark) → `art.narutomythos.webp`
 * sur les printKeys **déjà** au catalogue. Pas de mint.
 *
 * Meilleur candidat fan que ScanFlip (`wm:` CDN). CICABOOM `art.official`
 * reste prioritaire quand présent.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { parsePrintKey } from "@/core/identify/printKey";
import { httpGet } from "@/lib/http/httpClient";
import { packCardDir } from "@/lib/packPaths";
import { installCardFace } from "@/providers/shared/cardCatalogue/faceInstall";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { narutoMythosCuratedDir, NARUTO_MYTHOS_PACK_ID } from "./pack";
import { printKeysForNarutomythosSiteCardId } from "./siteCardId";

export const NARUTOMYTHOS_CARDS_API =
  "https://www.narutomythos.com/api/cards";
export const NARUTOMYTHOS_STORAGE_ORIGIN =
  "https://www.narutomythos.com/storage";
export const NARUTOMYTHOS_CARDS_PAGE =
  "https://www.narutomythos.com/fr/cards";

const LEDGER = "narutomythos-cards-ledger.json";
const SOURCE_ID = "narutomythos";
const ART_NAME = `art.${SOURCE_ID}.webp`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

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
  return path.join(narutoMythosCuratedDir(), "sources", LEDGER);
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

function preferredArtInDir(destDir: string): string | null {
  for (const name of [
    // HD watermark-free site faces beat low-res CICABOOM CDN when both exist.
    ART_NAME,
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
        headers: { "User-Agent": UA, Accept: "application/json" },
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

function loadLedger(): NarutomythosSiteLedgerCard[] {
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

async function installLangFace(input: {
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
    const preferred = preferredArtInDir(destDir);
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
    artName: ART_NAME,
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
  const cards = loadLedger();
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

    const wroteFr = await installLangFace({
      ...resolved,
      lang: "fr",
      faceUrl: card.faceFr ?? card.faceEn,
      downloadFaces,
      force,
      assets,
    });
    const wroteEn = await installLangFace({
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
