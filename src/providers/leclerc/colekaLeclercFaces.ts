/**
 * Moisson faces Coleka → staging → `art.coleka.webp` sous
 * `data/leclerc/<set>/cards/<set>/fr/<number>/`.
 *
 * Sources :
 * 1. Listing rubrique (pages 1…N via Flare, stop au mur Turnstile)
 * 2. Ledger CDN `coleka-cdn-faces.json` (URLs thumbs.coleka découvertes hors listing)
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import { downloadCardFaceBytes } from "@/providers/shared/cardCatalogue/faceInstall";
import { fetchColekaListingHtml } from "@/providers/shared/coleka/listingFetch";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { leclercFixeezLookupForSet } from "./buildFromLedgers";
import { leclercCuratedDir } from "./curatedPaths";
import { leclercOpForSetCode } from "./pack";
import { leclercPrintKey } from "./printKey";
import {
  COLEKA_LECLERC_LANG,
  COLEKA_LECLERC_LISTINGS,
  COLEKA_LECLERC_MAX_LISTING_PAGES,
  COLEKA_LECLERC_ORIGIN,
  COLEKA_LECLERC_SOURCE_ID,
  colekaLeclercListingForSet,
  colekaLeclercListingUrl,
  parseColekaLeclercListing,
  type ColekaLeclercCard,
} from "./parseColekaLeclerc";

function parseListingHtml(
  html: string,
  setCode: string,
): ReturnType<typeof parseColekaLeclercListing> {
  return parseColekaLeclercListing(html, setCode, {
    fixeezLookup: leclercFixeezLookupForSet(setCode),
  });
}

/** Staging HTML dumps: paginated `listing-N.html` + optional browser `listing-nbpp.html`. */
function readStagingListingCards(
  staging: string,
  setCode: string,
): ColekaLeclercCard[][] {
  const pageCards: ColekaLeclercCard[][] = [];
  for (let i = 0; i < COLEKA_LECLERC_MAX_LISTING_PAGES; i += 1) {
    const listingPath = path.join(staging, `listing-${i}.html`);
    if (!existsSync(listingPath)) continue;
    pageCards.push(
      parseListingHtml(readFileSync(listingPath, "utf8"), setCode).cards,
    );
  }
  const nbpp = path.join(staging, "listing-nbpp.html");
  if (existsSync(nbpp)) {
    pageCards.push(parseListingHtml(readFileSync(nbpp, "utf8"), setCode).cards);
  }
  return pageCards;
}

const STAGING_FOLDER = "coleka-faces";

export type ColekaLeclercFacesLedger = {
  source: string;
  sourceId: string;
  lang: string;
  sets: Record<string, { listingPath: string; url: string }>;
};

export type ColekaCdnFacesLedger = {
  source: string;
  sourceId: string;
  lang: string;
  note?: string;
  sets: Record<string, Record<string, string>>;
};

export function colekaLeclercFacesLedgerPath(): string {
  return path.join(leclercCuratedDir(), "sources", "coleka-leclerc-faces.json");
}

export function colekaCdnFacesLedgerPath(): string {
  return path.join(leclercCuratedDir(), "sources", "coleka-cdn-faces.json");
}

export function readColekaLeclercFacesLedger(): ColekaLeclercFacesLedger {
  return JSON.parse(
    readFileSync(colekaLeclercFacesLedgerPath(), "utf8"),
  ) as ColekaLeclercFacesLedger;
}

export function readColekaCdnFacesLedger(): ColekaCdnFacesLedger | null {
  const p = colekaCdnFacesLedgerPath();
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as ColekaCdnFacesLedger;
}

export function colekaLeclercFacesStagingDir(packId: string): string {
  return path.join(packStagingDir(packId), STAGING_FOLDER);
}

export function colekaLeclercStagingFile(card: ColekaLeclercCard): string {
  const ext = path.extname(new URL(card.faceUrl).pathname).toLowerCase();
  return `${card.number}${ext || ".webp"}`;
}

function stagingFileForNumber(number: string, faceUrl: string): string {
  const ext = path.extname(new URL(faceUrl).pathname).toLowerCase() || ".webp";
  return `${number}${ext}`;
}

async function downloadImage(
  url: string,
  referer: string,
): Promise<Buffer | null> {
  const buf = await downloadCardFaceBytes(url, {
    referer,
    minBytes: 800,
    timeoutMs: 40_000,
  });
  if (!buf) return null;
  // Coleka placeholder JPEG (~30k) for missing backs — reject tiny JPEG placeholders
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf.byteLength < 35_000) {
    return null;
  }
  return buf;
}

function mergeCardsByNumber(
  ...lists: ColekaLeclercCard[][]
): ColekaLeclercCard[] {
  const by = new Map<string, ColekaLeclercCard>();
  for (const list of lists) {
    for (const card of list) {
      // Last wins — CDN ledger (content-audited) overrides listing thumbs when
      // Coleka pairs a correct title with a misnamed / shifted filename.
      by.set(card.number, card);
    }
  }
  return [...by.values()].sort((a, b) => a.number.localeCompare(b.number));
}

function cardsFromCdnLedger(setCode: string): ColekaLeclercCard[] {
  const ledger = readColekaCdnFacesLedger();
  const rows = ledger?.sets?.[setCode];
  if (!rows) return [];
  const out: ColekaLeclercCard[] = [];
  for (const [number, faceUrl] of Object.entries(rows)) {
    if (!faceUrl?.startsWith("http")) continue;
    out.push({
      setCode,
      number,
      name: number,
      kind: number.startsWith("f") ? "fixeez" : "card",
      thumbUrl: faceUrl,
      faceUrl,
      pageUrl: faceUrl,
    });
  }
  return out;
}

export type ColekaLeclercHarvest = {
  setCode: string;
  cards: number;
  ok: number;
  skip: number;
  fail: number;
  pages: number;
};

async function harvestCardList(
  setCode: string,
  cards: ColekaLeclercCard[],
  staging: string,
  referer: string,
  force: boolean,
): Promise<{ ok: number; skip: number; fail: number }> {
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const card of cards) {
    const dest = path.join(staging, colekaLeclercStagingFile(card));
    if (!force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    const buf = await downloadImage(card.faceUrl, referer);
    if (!buf) {
      fail += 1;
      continue;
    }
    writeFileSync(dest, buf);
    ok += 1;
    await new Promise((r) => setTimeout(r, 80));
  }
  return { ok, skip, fail };
}

/**
 * Fetch listing pages 1…N (stop on wall / empty), merge CDN ledger, download.
 */
export async function harvestColekaLeclercFacesForSet(
  setCode: string,
  opts: { force?: boolean; stagingDir?: string; packId?: string } = {},
): Promise<ColekaLeclercHarvest | null> {
  const op = leclercOpForSetCode(setCode);
  if (!op) return null;

  const listing = colekaLeclercListingForSet(setCode);
  const packId = opts.packId ?? op.packId;
  const staging = opts.stagingDir ?? colekaLeclercFacesStagingDir(packId);
  mkdirSync(staging, { recursive: true });

  const pageCards: ColekaLeclercCard[][] = [];
  let pagesOk = 0;
  let listingUrl = `${COLEKA_LECLERC_ORIGIN}/`;

  if (listing) {
    listingUrl = colekaLeclercListingUrl(listing, 1);
    for (let page = 1; page <= COLEKA_LECLERC_MAX_LISTING_PAGES; page += 1) {
      const url = colekaLeclercListingUrl(listing, page);
      const dest = path.join(staging, `listing-${page - 1}.html`);
      const html = await fetchColekaListingHtml(
        url,
        dest,
        Boolean(opts.force) || page > 1,
      );
      if (!html) break;
      const parsed = parseListingHtml(html, setCode);
      if (!parsed.cards.length) break;
      pageCards.push(parsed.cards);
      pagesOk += 1;
      // Keep page-0 cache as the merge of all pages for install fallbacks
      if (page === 1) {
        writeFileSync(path.join(staging, "listing-0.html"), html, "utf8");
      }
    }
  }

  const cdnCards = cardsFromCdnLedger(setCode);
  const cards = mergeCardsByNumber(...pageCards, cdnCards);
  if (!cards.length) {
    return { setCode, cards: 0, ok: 0, skip: 0, fail: 0, pages: pagesOk };
  }

  const stats = await harvestCardList(
    setCode,
    cards,
    staging,
    listingUrl,
    Boolean(opts.force),
  );

  return {
    setCode,
    cards: cards.length,
    ok: stats.ok,
    skip: stats.skip,
    fail: stats.fail,
    pages: pagesOk,
  };
}

export type ColekaLeclercInstall = {
  faces: number;
  missing: string[];
};

function installCardFiles(
  index: LocalPrintsIndex,
  setCode: string,
  cards: ColekaLeclercCard[],
  staging: string,
  packId: string,
  lang: string,
  sourceId: string,
): ColekaLeclercInstall {
  const missing: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string;
  }[] = [];

  for (const card of cards) {
    const src = path.join(
      staging,
      stagingFileForNumber(card.number, card.faceUrl),
    );
    const printKey = leclercPrintKey(setCode, card.number);
    if (!printKey || !existsSync(src)) {
      missing.push(card.number);
      continue;
    }
    const ext = path.extname(src).toLowerCase() || ".webp";
    const art = `art.${sourceId}${ext}`;
    const destDir = path.join(
      packCardsDir(packId),
      setCode,
      lang,
      card.number,
    );
    mkdirSync(destDir, { recursive: true });
    copyFileSync(src, path.join(destDir, art));
    assets.push({
      printKey,
      lang,
      art,
      sourceUrl: card.pageUrl || card.faceUrl,
    });
  }

  if (assets.length) index.writeAssets(assets);
  return { faces: assets.length, missing };
}

export function installColekaLeclercFaces(
  index: LocalPrintsIndex,
  setCode: string,
  opts: { stagingDir?: string; packId?: string } = {},
): ColekaLeclercInstall {
  const op = leclercOpForSetCode(setCode);
  if (!op) return { faces: 0, missing: [] };

  const packId = opts.packId ?? op.packId;
  const staging = opts.stagingDir ?? colekaLeclercFacesStagingDir(packId);

  const facesLedger = existsSync(colekaLeclercFacesLedgerPath())
    ? readColekaLeclercFacesLedger()
    : null;
  const cdnLedger = readColekaCdnFacesLedger();
  const lang =
    facesLedger?.lang?.trim().toLowerCase() ||
    cdnLedger?.lang?.trim().toLowerCase() ||
    COLEKA_LECLERC_LANG;
  const sourceId =
    facesLedger?.sourceId || cdnLedger?.sourceId || COLEKA_LECLERC_SOURCE_ID;

  const cards = mergeCardsByNumber(
    ...readStagingListingCards(staging, setCode),
    cardsFromCdnLedger(setCode),
  );
  if (!cards.length) return { faces: 0, missing: [] };

  return installCardFiles(
    index,
    setCode,
    cards,
    staging,
    packId,
    lang,
    sourceId,
  );
}

/** Harvest every Coleka-backed active set (used by scripts). */
export async function harvestAllColekaLeclercFaces(
  opts: { force?: boolean } = {},
): Promise<ColekaLeclercHarvest[]> {
  const out: ColekaLeclercHarvest[] = [];
  const setCodes = new Set<string>([
    ...COLEKA_LECLERC_LISTINGS.map((r) => r.setCode),
    ...Object.keys(readColekaCdnFacesLedger()?.sets ?? {}),
  ]);
  for (const setCode of setCodes) {
    const report = await harvestColekaLeclercFacesForSet(setCode, opts);
    if (report) out.push(report);
  }
  return out;
}
