/**
 * Naruto Ninja Ranks — face harvest / install (AnimeCollection, Coleka, eBay,
 * Inkworks samples, Blogger rip, Imadoki sheets, arcadegamecards).
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import sharp from "sharp";

import { trimLightImageMargins } from "@/core/enrich/media/imageTrim";
import { httpGet } from "@/lib/http/httpClient";
import { fetchTextWithFlareFallback } from "@/lib/http/scrapeFetch";
import {
  packCardsDir,
  packCatalogDb,
  packSealedProductsDir,
  packStagingDir,
} from "@/lib/packPaths";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import {
  hashNarutoCuratedFile,
  hashNarutoCuratedJson,
  narutoDigArtefactFresh,
  promoteAndPurgeNarutoDig,
} from "@/providers/naruto/shared/promoteNarutoDig";
import {
  ebayBrowseItemId,
  fetchEbayBrowseItem,
} from "@/providers/commerce/ebay/browseItem";
import { fetchColekaListingHtml } from "@/providers/shared/coleka/listingFetch";
import {
  writeLocalSealedProducts,
  type LocalSealedWrite,
} from "@/providers/shared/sealedProducts/localWrite";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";

import { NARUTO_RANKS_PACK_ID, narutoRanksCuratedDir } from "../pack";
import { ninjaRanksPrintKey } from "../printKey";
import { readInkworksChecklist } from "../pipeline/ledgers";
import {
  ARCADE_LANG,
  ARCADE_SOURCE_ID,
  arcadeBackImageUrl,
  arcadeListingUrls,
  namesAgree,
  parseArcadeListing,
  type ArcadeCard,
  type ArcadeNameCheck,
  COLEKA_NINJA_RANKS_LANG,
  COLEKA_NINJA_RANKS_SET,
  colekaNinjaRanksBackUrlCandidates,
  colekaNinjaRanksCardKey,
  colekaNinjaRanksListingPageUrls,
  colekaNinjaRanksWwwFaceUrl,
  parseColekaNinjaRanksListing,
  type ColekaNinjaRanksCard,
  IMADOKI_LANG,
  IMADOKI_SHEETS,
  IMADOKI_SOURCE_ID,
  imadokiGalleryUrl,
  imadokiSheetUrl,
  splitAxis,
  type ImadokiSheet,
} from "../parse/catalogues";

/** Safari UA — AnimeCollection + Blogger pack rip. */
const UA_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** Chrome UA — Coleka, Imadoki, arcadegamecards. */
const UA_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

/** eBay Browse API image fetch. */
const UA_EBAY = "Mozilla/5.0 PlacarrNarutoScrape/1.0 (eBay Browse API image fetch)";

/** Inkworks Wayback harvest. */
const UA_INKWORKS = "PlacarrNarutoScrape/1.0 (local collection)";

// Re-export for callers that imported COLEKA_NINJA_RANKS_LANG from colekaNinjaRanks.
export { COLEKA_NINJA_RANKS_LANG };

// ─── AnimeCollection faces ───────────────────────────────────────────────

/**
 * Archive AnimeCollection Ninja Ranks (`ids=200`) — grille complète + HD + dos.
 *
 * Source principale FR : rectos `h3000` (sinon h400), versos via détail AJAX.
 * Ranking catalogue : `animecollection` au-dessus de Coleka.
 */

const AC_LEDGER_FILE = "animecollection.json";
const AC_STAGING_FOLDER = "animecollection-faces";
const AC_ARTEFACT = "faces:animecollection-ranks";

export function animeCollectionRanksContentHash(): string {
  const ledger = readAnimeCollectionRanksLedger();
  return hashNarutoCuratedJson({
    faces: (ledger.faces ?? []).map((f) => ({
      acId: f.acId,
      printed: f.printed,
      backImageId: f.backImageId ?? null,
    })),
  });
}

const AC_ORIGIN = "http://www.animecollection.fr";
const AC_SET_PATH = "87/200";

/** Printed label on the AC grid → Placarr set / number. */
const INSERT_LABEL_RE = /^(FF|NW|SD|NS|GS)(\d+)$/i;

export type AnimeCollectionRanksFaceRow = {
  printed: string;
  /** Checklist set: nr / ff / sd / nw / ns / bl (GS → bl). */
  set: string;
  number: string;
  acId: string;
  /** Image id for the verso block when known. */
  backImageId?: string;
};

export type AnimeCollectionRanksLedger = {
  source: string;
  url: string;
  sourceId: string;
  lang: string;
  faceUrlTemplate: string;
  hdFaceUrlTemplate?: string;
  faces?: AnimeCollectionRanksFaceRow[];
  ingest?: string;
};

export function animeCollectionRanksLedgerPath(): string {
  return path.join(narutoRanksCuratedDir(), "sources", AC_LEDGER_FILE);
}

export function readAnimeCollectionRanksLedger(): AnimeCollectionRanksLedger {
  return JSON.parse(
    readFileSync(animeCollectionRanksLedgerPath(), "utf8"),
  ) as AnimeCollectionRanksLedger;
}

export function animeCollectionRanksStagingDir(): string {
  return path.join(packStagingDir(NARUTO_RANKS_PACK_ID), AC_STAGING_FOLDER);
}

/**
 * Map AC printed label → set/number.
 * Base 1–72 → nr ; FF/NW/SD/NS → same codes ; GS → bl (EU Group Seven).
 */
export function ranksSetForAcPrintedLabel(printed: string): {
  set: string;
  number: string;
} | null {
  const raw = printed.trim();
  if (!raw) return null;
  const numeric = Number.parseInt(raw, 10);
  if (Number.isFinite(numeric) && String(numeric) === raw) {
    if (numeric >= 1 && numeric <= 72) {
      return { set: "nr", number: String(numeric).padStart(4, "0") };
    }
    return null;
  }
  const insert = INSERT_LABEL_RE.exec(raw);
  if (!insert) return null;
  const kind = insert[1]!.toLowerCase();
  const n = Number.parseInt(insert[2]!, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  const set = kind === "gs" ? "bl" : kind;
  return { set, number: String(n).padStart(4, "0") };
}

/** @deprecated use ranksSetForAcPrintedLabel */
export function ranksSetForAcPrinted(printed: number): {
  set: string;
  number: string;
} | null {
  return ranksSetForAcPrintedLabel(String(printed));
}

export function parseAnimeCollectionRanksFaces(
  html: string,
): AnimeCollectionRanksFaceRow[] {
  const re =
    /bc_texte_numero">([^<]+)<\/div>[\s\S]{0,800}?afficher_detail\('(\d+)'/gi;
  const out: AnimeCollectionRanksFaceRow[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(re)) {
    const printedRaw = (match[1] ?? "").trim();
    const acId = match[2]!;
    if (/^(booster|album)/i.test(printedRaw)) continue;
    const mapped = ranksSetForAcPrintedLabel(printedRaw);
    if (!mapped) continue;
    const key = `${mapped.set}:${mapped.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      printed: printedRaw,
      set: mapped.set,
      number: mapped.number,
      acId,
    });
  }
  return out.sort((a, b) => {
    if (a.set !== b.set) return a.set.localeCompare(b.set);
    return Number.parseInt(a.number, 10) - Number.parseInt(b.number, 10);
  });
}

/** Parse verso image id from AC card detail AJAX HTML. */
export function parseAnimeCollectionRanksBackImageId(html: string): string | null {
  const m =
    /Dos de la carte[\s\S]{0,1200}?afficher_detail_img\('(\d+)'/i.exec(html) ??
    /Dos de la carte[\s\S]{0,1200}?\/(\d+)\/h100_(\d+)_carte_image/i.exec(html);
  if (!m) return null;
  return (m[2] ?? m[1] ?? "").trim() || null;
}

function faceUrlHd(acId: string): string {
  return `${AC_ORIGIN}/cartes/${AC_SET_PATH}/h3000_${acId}_carte.jpg`;
}

function faceUrlH400(acId: string): string {
  return `${AC_ORIGIN}/cartes/${AC_SET_PATH}/h400_${acId}_carte.jpg`;
}

function backUrlHd(acId: string, imageId: string): string {
  return `${AC_ORIGIN}/cartes/${AC_SET_PATH}/${acId}/h3000_${imageId}_carte_image.jpg`;
}

function backUrlH400(acId: string, imageId: string): string {
  return `${AC_ORIGIN}/cartes/${AC_SET_PATH}/${acId}/h400_${imageId}_carte_image.jpg`;
}

function detailInfosUrl(acId: string): string {
  return `${AC_ORIGIN}/traitements_ajax/get_infos_detail_carte.php?id=${acId}`;
}

async function downloadAnimeCollectionImage(
  url: string,
  referer: string,
): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA_SAFARI, Referer: referer },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (status: number) => status === 200,
    });
    const data = res.data;
    if (!data || data.byteLength < 200) return null;
    return Buffer.from(data);
  } catch {
    return null;
  }
}

async function downloadAnimeCollectionPrefer(
  urls: readonly string[],
  referer: string,
): Promise<Buffer | null> {
  for (const url of urls) {
    const buf = await downloadAnimeCollectionImage(url, referer);
    if (buf) return buf;
  }
  return null;
}

function stagingArtName(row: AnimeCollectionRanksFaceRow): string {
  return `${row.set}-${row.number}.jpg`;
}

function stagingBackName(row: AnimeCollectionRanksFaceRow): string {
  return `${row.set}-${row.number}.back.jpg`;
}

export type AnimeCollectionRanksHarvest = {
  cards: number;
  ok: number;
  skip: number;
  fail: number;
  backsOk: number;
  backsSkip: number;
  backsFail: number;
};

export async function harvestAnimeCollectionRanksFaces(
  opts: { force?: boolean; refreshLedger?: boolean } = {},
): Promise<AnimeCollectionRanksHarvest> {
  const contentHash = animeCollectionRanksContentHash();
  if (
    narutoDigArtefactFresh({
      packId: NARUTO_RANKS_PACK_ID,
      artefactId: AC_ARTEFACT,
      contentHash,
      force: opts.force,
    })
  ) {
    const ledger = readAnimeCollectionRanksLedger();
    const n = ledger.faces?.length ?? 0;
    return {
      cards: n,
      ok: 0,
      skip: n,
      fail: 0,
      backsOk: 0,
      backsSkip: n,
      backsFail: 0,
    };
  }

  const ledger = readAnimeCollectionRanksLedger();
  const referer = ledger.url;
  let faces = ledger.faces ?? [];

  if (opts.refreshLedger || opts.force || !faces.length) {
    const res = await httpGet(ledger.url, {
      headers: { "User-Agent": UA_SAFARI },
      timeout: 60_000,
    });
    const html = String((res as { data?: unknown }).data ?? "");
    faces = parseAnimeCollectionRanksFaces(html);
  }

  // Enrich verso ids from detail AJAX (needed for first full archive).
  const needBackMeta = faces.some((f) => !f.backImageId);
  if (needBackMeta || opts.force) {
    for (let i = 0; i < faces.length; i++) {
      const row = faces[i]!;
      if (!opts.force && row.backImageId) continue;
      try {
        const res = await httpGet(detailInfosUrl(row.acId), {
          headers: { "User-Agent": UA_SAFARI, Referer: referer },
          timeout: 30_000,
        });
        const detailHtml = String((res as { data?: unknown }).data ?? "");
        const backId = parseAnimeCollectionRanksBackImageId(detailHtml);
        if (backId) faces[i] = { ...row, backImageId: backId };
      } catch {
        /* verso optional */
      }
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  writeFileSync(
    animeCollectionRanksLedgerPath(),
    `${JSON.stringify(
      {
        ...ledger,
        ingest:
          "archive complète ids=200 — fronts h3000 (fallback h400) + dos AJAX → art/back.animecollection.jpg",
        faceUrlTemplate: faceUrlH400("{acId}"),
        hdFaceUrlTemplate: faceUrlHd("{acId}"),
        faces,
        observed: new Date().toISOString().slice(0, 10),
      },
      null,
      2,
    )}\n`,
  );

  const staging = animeCollectionRanksStagingDir();
  mkdirSync(staging, { recursive: true });
  let ok = 0;
  let skip = 0;
  let fail = 0;
  let backsOk = 0;
  let backsSkip = 0;
  let backsFail = 0;

  for (const row of faces) {
    const artDest = path.join(staging, stagingArtName(row));
    if (!opts.force && existsSync(artDest)) {
      skip += 1;
    } else {
      const buf = await downloadAnimeCollectionPrefer(
        [faceUrlHd(row.acId), faceUrlH400(row.acId)],
        referer,
      );
      if (!buf) fail += 1;
      else {
        writeFileSync(artDest, buf);
        ok += 1;
      }
      await new Promise((r) => setTimeout(r, 60));
    }

    if (!row.backImageId) {
      backsFail += 1;
      continue;
    }
    const backDest = path.join(staging, stagingBackName(row));
    if (!opts.force && existsSync(backDest)) {
      backsSkip += 1;
      continue;
    }
    const backBuf = await downloadAnimeCollectionPrefer(
      [
        backUrlHd(row.acId, row.backImageId),
        backUrlH400(row.acId, row.backImageId),
      ],
      referer,
    );
    if (!backBuf) backsFail += 1;
    else {
      writeFileSync(backDest, backBuf);
      backsOk += 1;
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  return {
    cards: faces.length,
    ok,
    skip,
    fail,
    backsOk,
    backsSkip,
    backsFail,
  };
}

export function installAnimeCollectionRanksFaces(
  index: LocalPrintsIndex,
): { faces: number; backs: number; missing: string[] } {
  const ledger = readAnimeCollectionRanksLedger();
  const faces = ledger.faces ?? [];
  const staging = animeCollectionRanksStagingDir();
  const lang = ledger.lang?.trim().toLowerCase() || "fr";
  const missing: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art?: string;
    back?: string;
    sourceUrl: string;
  }[] = [];
  if (!existsSync(staging)) {
    return { faces: 0, backs: 0, missing: faces.map((f) => f.printed) };
  }
  let faceCount = 0;
  let backCount = 0;
  for (const row of faces) {
    const artSrc = path.join(staging, stagingArtName(row));
    const backSrc = path.join(staging, stagingBackName(row));
    const hasArt = existsSync(artSrc);
    const hasBack = existsSync(backSrc);
    if (!hasArt && !hasBack) {
      missing.push(row.printed);
      continue;
    }
    const printKey = ninjaRanksPrintKey(row.set, row.number);
    if (!printKey) {
      missing.push(row.printed);
      continue;
    }
    const cardDir = path.join(
      packCardsDir(NARUTO_RANKS_PACK_ID),
      row.set,
      lang,
      row.number,
    );
    mkdirSync(cardDir, { recursive: true });
    const artName = "art.animecollection.jpg";
    const backName = "back.animecollection.jpg";
    if (hasArt) {
      copyFileSync(artSrc, path.join(cardDir, artName));
      faceCount += 1;
    }
    if (hasBack) {
      copyFileSync(backSrc, path.join(cardDir, backName));
      backCount += 1;
    }
    assets.push({
      printKey,
      lang,
      ...(hasArt ? { art: artName } : {}),
      ...(hasBack ? { back: backName } : {}),
      sourceUrl: faceUrlHd(row.acId),
    });
  }
  if (assets.length) index.writeAssets(assets);
  if (missing.length === 0 && faceCount > 0) {
    promoteAndPurgeNarutoDig({
      packId: NARUTO_RANKS_PACK_ID,
      artefactId: AC_ARTEFACT,
      stagingRel: AC_STAGING_FOLDER,
      contentHash: animeCollectionRanksContentHash(),
    });
  }
  return { faces: faceCount, backs: backCount, missing };
}


// ─── Coleka Ninja Ranks ──────────────────────────────────────────────────

/**
 * Moisson et pose des scans Coleka de Ninja Ranks.
 *
 * Deux temps, comme le reste du pack : `harvest` descend le listing puis les
 * faces dans le staging, `install` les copie sous `cards/nr/{numéro}/en/` et
 * les inscrit à l'index. Rien n'est deviné entre les deux — le parseur a déjà
 * refusé ce qu'il ne pouvait pas prouver, voir `parseColekaNinjaRanks`.
 */

const COLEKA_STAGING_FOLDER = "coleka-ninja-ranks";
const COLEKA_LEDGER_FILE = "coleka-ninja-ranks.json";

const COLEKA_NINJA_RANKS_REFERER =
  "https://www.coleka.com/en/trading-cards/panini-cards/naruto-ninja-ranks_r25928";

export type ColekaNinjaRanksBackOnly = {
  setCode?: string;
  number: string;
  colekaRef: number;
  colekaId: string;
  pageUrl: string;
  backUrl: string;
  note?: string;
};

export type ColekaNinjaRanksRejectedFace = {
  setCode?: string;
  number: string;
  reason: string;
};

export type ColekaNinjaRanksLedger = {
  source: string;
  url: string;
  lang: string;
  sourceId: string;
  notIngested: { what: string; reason: string }[];
  backOnly?: ColekaNinjaRanksBackOnly[];
  rejectedFaces?: ColekaNinjaRanksRejectedFace[];
};

export function colekaNinjaRanksLedgerPath(): string {
  return path.join(narutoRanksCuratedDir(), "sources", COLEKA_LEDGER_FILE);
}

export function readColekaNinjaRanksLedger(): ColekaNinjaRanksLedger {
  return JSON.parse(
    readFileSync(colekaNinjaRanksLedgerPath(), "utf8"),
  ) as ColekaNinjaRanksLedger;
}

export function colekaNinjaRanksRejectedFaceKey(row: {
  setCode?: string;
  number: string;
}): string {
  const setCode = row.setCode?.trim() || COLEKA_NINJA_RANKS_SET;
  return `${setCode}-${row.number}`;
}

export function colekaNinjaRanksRejectedFaceKeys(
  ledger: ColekaNinjaRanksLedger = readColekaNinjaRanksLedger(),
): Set<string> {
  const keys = new Set<string>();
  for (const row of ledger.rejectedFaces ?? []) {
    keys.add(colekaNinjaRanksRejectedFaceKey(row));
  }
  return keys;
}

function purgeColekaRejectedFaces(
  index: LocalPrintsIndex,
  ledger: ColekaNinjaRanksLedger,
): void {
  const rejected = colekaNinjaRanksRejectedFaceKeys(ledger);
  if (!rejected.size) return;
  const lang = ledger.lang?.trim().toLowerCase();
  const dbPath = packCatalogDb(NARUTO_RANKS_PACK_ID);
  if (!existsSync(dbPath)) return;
  const db = new DatabaseSync(dbPath);
  try {
    const stmt = db.prepare(
      `UPDATE print_assets
       SET art = NULL
       WHERE print_key = ? AND lang = ? AND art LIKE 'art.coleka%'`,
    );
    for (const key of rejected) {
      const [setCode, number] = key.split("-");
      const printKey = ninjaRanksPrintKey(setCode, number);
      if (!printKey) continue;
      stmt.run(printKey, lang);
    }
  } finally {
    db.close();
  }
  index.exportIndex();
}

function removeColekaRejectedFaceFiles(ledger: ColekaNinjaRanksLedger): void {
  /*
    Ne pas effacer `art.coleka` des dossiers cartes : le rejet ne concerne que
    l'affichage (index → `art.reconstructed` ou trou honnête). Le dump Coleka
    reste à côté, comme un scan Inkworks à côté d'un packshot curé.
  */
  void ledger;
}

export function colekaNinjaRanksStagingDir(): string {
  return path.join(packStagingDir(NARUTO_RANKS_PACK_ID), COLEKA_STAGING_FOLDER);
}

export function colekaNinjaRanksStagingBasename(card: {
  setCode: string;
  number: string;
}): string {
  return colekaNinjaRanksCardKey(card);
}

/** `nr-0007` / `ff-0001` dans le staging — pas le slug Coleka. */
export function colekaNinjaRanksStagingFile(card: {
  setCode: string;
  number: string;
  faceUrl: string;
}): string {
  const ext = path.extname(new URL(card.faceUrl).pathname).toLowerCase();
  return `${colekaNinjaRanksStagingBasename(card)}${ext || ".webp"}`;
}

/** `nr-0007-back.webp` — verso dérivé du recto. */
export function colekaNinjaRanksStagingBackFile(card: {
  setCode: string;
  number: string;
  faceUrl: string;
}): string {
  const ext = path.extname(new URL(card.faceUrl).pathname).toLowerCase();
  return `${colekaNinjaRanksStagingBasename(card)}-back${ext || ".webp"}`;
}

/** Chemins candidats : nouveau `{set}-{num}` puis l'ancien `{num}` pour la base. */
function colekaNinjaRanksStagingFaceCandidates(
  staging: string,
  card: ColekaNinjaRanksCard,
): string[] {
  const primary = path.join(staging, colekaNinjaRanksStagingFile(card));
  if (card.setCode !== COLEKA_NINJA_RANKS_SET) return [primary];
  const ext = path.extname(primary).toLowerCase() || ".webp";
  return [primary, path.join(staging, `${card.number}${ext}`)];
}

function colekaNinjaRanksStagingBackCandidates(
  staging: string,
  card: ColekaNinjaRanksCard,
): string[] {
  const primary = path.join(staging, colekaNinjaRanksStagingBackFile(card));
  if (card.setCode !== COLEKA_NINJA_RANKS_SET) return [primary];
  const ext = path.extname(primary).toLowerCase() || ".webp";
  return [primary, path.join(staging, `${card.number}-back${ext}`)];
}

function resolveColekaNinjaRanksStagingFace(
  staging: string,
  card: ColekaNinjaRanksCard,
): string | null {
  for (const candidate of colekaNinjaRanksStagingFaceCandidates(
    staging,
    card,
  )) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveColekaNinjaRanksStagingBack(
  staging: string,
  card: ColekaNinjaRanksCard,
): string | null {
  for (const candidate of colekaNinjaRanksStagingBackCandidates(
    staging,
    card,
  )) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Verso attesté sur une fiche item sans recto listing prouvable. */
export function colekaBackOnlyStagingFile(
  number: string,
  backUrl: string,
): string {
  const ext = path.extname(new URL(backUrl).pathname).toLowerCase();
  return `${number}-back${ext || ".webp"}`;
}

async function downloadColekaImage(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA_CHROME, Referer: COLEKA_NINJA_RANKS_REFERER },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (status: number) => status === 200,
    });
    const data = res.data;
    if (!data || data.byteLength < 500) return null;
    return Buffer.from(data);
  } catch {
    return null;
  }
}

/** Essaie `-001` puis `-002` ; refuse un octet identique au recto. */
async function downloadColekaBack(
  card: ColekaNinjaRanksCard,
  frontBuf: Buffer | null,
): Promise<Buffer | null> {
  for (const url of colekaNinjaRanksBackUrlCandidates(card.faceUrl)) {
    if (url === colekaNinjaRanksWwwFaceUrl(card.faceUrl)) continue;
    const buf = await downloadColekaImage(url);
    if (!buf) continue;
    if (frontBuf && buf.length === frontBuf.length && buf.equals(frontBuf)) {
      continue;
    }
    return buf;
  }
  return null;
}

export type ColekaNinjaRanksHarvest = {
  pages: number;
  cards: number;
  ok: number;
  skip: number;
  fail: number;
  backOk: number;
  backSkip: number;
  backFail: number;
  rejected: { ref: string; name: string; reason: string }[];
};

export async function harvestColekaNinjaRanks(
  opts: { force?: boolean } = {},
): Promise<ColekaNinjaRanksHarvest> {
  const staging = colekaNinjaRanksStagingDir();
  mkdirSync(staging, { recursive: true });
  const ledger = readColekaNinjaRanksLedger();
  const seen = new Map<string, ColekaNinjaRanksCard>();
  const rejected: ColekaNinjaRanksHarvest["rejected"] = [];
  let pages = 0;

  for (const [i, url] of colekaNinjaRanksListingPageUrls().entries()) {
    const dest = path.join(staging, `listing-${i}.html`);
    const html = await fetchColekaListingHtml(url, dest, Boolean(opts.force));
    // Une page derrière le mur rend `null` : on s'arrête là plutôt que de
    // compter comme vide une page qu'on n'a pas lue.
    if (!html) continue;
    pages += 1;
    const parsed = parseColekaNinjaRanksListing(html);
    for (const card of parsed.cards) {
      const key = colekaNinjaRanksCardKey(card);
      if (!seen.has(key)) seen.set(key, card);
    }
    rejected.push(...parsed.rejected);
  }

  let ok = 0;
  let skip = 0;
  let fail = 0;
  let backOk = 0;
  let backSkip = 0;
  let backFail = 0;
  for (const card of seen.values()) {
    const dest = path.join(staging, colekaNinjaRanksStagingFile(card));
    const existingFace = resolveColekaNinjaRanksStagingFace(staging, card);
    let frontBuf: Buffer | null = null;
    if (!opts.force && existingFace) {
      skip += 1;
      frontBuf = readFileSync(existingFace);
    } else {
      frontBuf = await downloadColekaImage(card.faceUrl);
      if (!frontBuf) {
        fail += 1;
      } else {
        writeFileSync(dest, frontBuf);
        ok += 1;
      }
    }

    const backDest = path.join(staging, colekaNinjaRanksStagingBackFile(card));
    const existingBack = resolveColekaNinjaRanksStagingBack(staging, card);
    if (!opts.force && existingBack) {
      backSkip += 1;
    } else if (!frontBuf) {
      backFail += 1;
    } else {
      const backBuf = await downloadColekaBack(card, frontBuf);
      if (!backBuf) {
        backFail += 1;
      } else {
        writeFileSync(backDest, backBuf);
        backOk += 1;
      }
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  for (const row of ledger.backOnly ?? []) {
    const backDest = path.join(
      staging,
      colekaBackOnlyStagingFile(row.number, row.backUrl),
    );
    if (!opts.force && existsSync(backDest)) {
      backSkip += 1;
    } else {
      const backBuf = await downloadColekaImage(row.backUrl);
      if (!backBuf) {
        backFail += 1;
      } else {
        writeFileSync(backDest, backBuf);
        backOk += 1;
      }
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  return {
    pages,
    cards: seen.size,
    ok,
    skip,
    fail,
    backOk,
    backSkip,
    backFail,
    rejected,
  };
}

export type ColekaNinjaRanksInstall = {
  faces: number;
  backs: number;
  missing: string[];
};

export function installColekaNinjaRanks(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): ColekaNinjaRanksInstall {
  const staging = opts.stagingDir ?? colekaNinjaRanksStagingDir();
  const ledger = readColekaNinjaRanksLedger();
  const lang = ledger.lang?.trim().toLowerCase();
  const missing: string[] = [];
  const rejected = colekaNinjaRanksRejectedFaceKeys(ledger);

  removeColekaRejectedFaceFiles(ledger);

  if (!existsSync(staging)) {
    purgeColekaRejectedFaces(index, ledger);
    return { faces: 0, backs: 0, missing };
  }

  const assetsByKey = new Map<
    string,
    {
      printKey: string;
      lang: string;
      art?: string;
      back?: string;
      sourceUrl: string | null;
    }
  >();

  for (const [i] of colekaNinjaRanksListingPageUrls().entries()) {
    const listing = path.join(staging, `listing-${i}.html`);
    if (!existsSync(listing)) continue;
    const parsed = parseColekaNinjaRanksListing(readFileSync(listing, "utf8"));
    for (const card of parsed.cards) {
      if (rejected.has(colekaNinjaRanksCardKey(card))) continue;
      const src = resolveColekaNinjaRanksStagingFace(staging, card);
      const backSrc = resolveColekaNinjaRanksStagingBack(staging, card);
      if (!src) {
        missing.push(colekaNinjaRanksCardKey(card));
        continue;
      }
      const printKey = ninjaRanksPrintKey(card.setCode, card.number);
      if (!printKey) {
        missing.push(colekaNinjaRanksCardKey(card));
        continue;
      }
      /*
        `cards/{set}/{langue}/{numéro}` — dans cet ordre.

        C'est celui qu'`assetsCardUrl` reconstruit pour servir le fichier, et
        celui que le pack `dbs` respecte (`cards/sd16/fr/03/`). Ce pack-ci
        écrivait `{set}/{numéro}/{langue}` : les octets étaient bien là, l'URL
        pointait à côté, et l'admin n'a jamais montré une seule face. Le pack
        Carddass n'a pas ce problème parce qu'il passe par
        `narutoCardPathFromCollector`, qui ne sait lire que ses propres
        identifiants (`ni0001`) et rend `null` sur un numéro nu.
      */
      const destDir = path.join(
        packCardsDir(NARUTO_RANKS_PACK_ID),
        card.setCode,
        lang,
        card.number,
      );
      mkdirSync(destDir, { recursive: true });
      const ext = path.extname(src).toLowerCase() || ".webp";
      const art = `art.${ledger.sourceId}${ext}`;
      copyFileSync(src, path.join(destDir, art));

      let back: string | undefined;
      if (backSrc) {
        const backFile = `back.${ledger.sourceId}${ext}`;
        copyFileSync(backSrc, path.join(destDir, backFile));
        back = backFile;
      }

      const assetKey = `${printKey}:${lang}`;
      const existing = assetsByKey.get(assetKey);
      assetsByKey.set(assetKey, {
        printKey,
        lang,
        art: existing?.art ?? art,
        back: back ?? existing?.back,
        sourceUrl: card.faceUrl,
      });
    }
  }

  for (const row of ledger.backOnly ?? []) {
    const backSrc = path.join(
      staging,
      colekaBackOnlyStagingFile(row.number, row.backUrl),
    );
    if (!existsSync(backSrc)) {
      missing.push(row.number);
      continue;
    }
    const setCode = row.setCode?.trim() || COLEKA_NINJA_RANKS_SET;
    const printKey = ninjaRanksPrintKey(setCode, row.number);
    if (!printKey) {
      missing.push(row.number);
      continue;
    }
    const destDir = path.join(
      packCardsDir(NARUTO_RANKS_PACK_ID),
      setCode,
      lang,
      row.number,
    );
    mkdirSync(destDir, { recursive: true });
    const ext = path.extname(backSrc).toLowerCase() || ".webp";
    const backFile = `back.${ledger.sourceId}${ext}`;
    copyFileSync(backSrc, path.join(destDir, backFile));

    const assetKey = `${printKey}:${lang}`;
    const existing = assetsByKey.get(assetKey);
    assetsByKey.set(assetKey, {
      printKey,
      lang,
      art: existing?.art,
      back: backFile,
      sourceUrl: row.pageUrl,
    });
  }

  const assets = [...assetsByKey.values()];
  if (assets.length) index.writeAssets(assets);
  purgeColekaRejectedFaces(index, ledger);
  if (missing.length === 0 && assets.length > 0 && !opts.stagingDir) {
    promoteAndPurgeNarutoDig({
      packId: NARUTO_RANKS_PACK_ID,
      artefactId: "faces:coleka-ranks",
      stagingRel: COLEKA_STAGING_FOLDER,
    });
  }
  return {
    faces: assets.filter((a) => a.art).length,
    backs: assets.filter((a) => a.back).length,
    missing,
  };
}



// ─── eBay assets ─────────────────────────────────────────────────────────

/**
 * Annonces eBay Ninja Ranks via Browse API — pas de scrape HTML.
 *
 * Le ledger `ebay-ninja-ranks.json` liste les item ids. Seul le sell sheet
 * dealer entre en staging ; les annonces pick-a-card servent d'attestation.
 */

const EBAY_LEDGER_FILE = "ebay-ninja-ranks.json";
const EBAY_STAGING_FOLDER = "ebay-ninja-ranks";

export type EbayNinjaRanksListing = {
  legacyItemId: string;
  variationId?: string;
  listing: string;
  role: string;
  state: string;
  ingest?: string;
  stagingPrefix?: string;
  note?: string;
  finding?: string;
};

export type EbayNinjaRanksLedger = {
  source: string;
  marketplaceId: string;
  listings: EbayNinjaRanksListing[];
};

export function ebayNinjaRanksLedgerPath(): string {
  return path.join(narutoRanksCuratedDir(), "sources", EBAY_LEDGER_FILE);
}

export function readEbayNinjaRanksLedger(): EbayNinjaRanksLedger {
  return JSON.parse(
    readFileSync(ebayNinjaRanksLedgerPath(), "utf8"),
  ) as EbayNinjaRanksLedger;
}

export function ebayNinjaRanksStagingDir(): string {
  return path.join(packStagingDir(NARUTO_RANKS_PACK_ID), EBAY_STAGING_FOLDER);
}

export type EbayNinjaRanksSyncReport = {
  fetched: number;
  images: number;
  skipped: string[];
  expired: string[];
};

export async function syncEbayNinjaRanksFromBrowseApi(
  opts: { force?: boolean } = {},
): Promise<EbayNinjaRanksSyncReport> {
  const ledger = readEbayNinjaRanksLedger();
  const staging = ebayNinjaRanksStagingDir();
  mkdirSync(staging, { recursive: true });
  const skipped: string[] = [];
  const expired: string[] = [];
  let fetched = 0;
  let images = 0;

  for (const row of ledger.listings) {
    if (row.state === "expired") {
      expired.push(row.legacyItemId);
      continue;
    }
    if (row.ingest !== "staging") {
      skipped.push(row.legacyItemId);
      continue;
    }
    const itemId = ebayBrowseItemId(row.legacyItemId, row.variationId ?? "0");
    const item = await fetchEbayBrowseItem(itemId, {
      marketplaceId: ledger.marketplaceId,
    });
    if (!item) {
      expired.push(row.legacyItemId);
      continue;
    }
    fetched += 1;
    writeFileSync(
      path.join(staging, `${row.stagingPrefix ?? row.legacyItemId}.json`),
      JSON.stringify(item, null, 2),
      "utf8",
    );
    const prefix = row.stagingPrefix ?? row.legacyItemId;
    for (const [i, url] of item.imageUrls.entries()) {
      const dest = path.join(staging, `${prefix}-${i + 1}.jpg`);
      if (!opts.force && existsSync(dest)) continue;
      try {
        const res = await httpGet<ArrayBuffer>(url, {
          headers: { "User-Agent": UA_EBAY, Referer: row.listing },
          responseType: "arraybuffer",
          timeout: 40_000,
          validateStatus: (status) => status === 200,
        });
        const buf = Buffer.from(res.data);
        if (buf.byteLength < 4_000) continue;
        writeFileSync(dest, buf);
        images += 1;
      } catch {
        /* octets manquants = trou honnête */
      }
    }
  }

  return { fetched, images, skipped, expired };
}


// ─── Inkworks official ───────────────────────────────────────────────────

/**
 * Visuels officiels Inkworks (Wayback) → produits scellés, pas des faces.
 *
 * La page 2006 montre un sachet, un display, un album, un logo, deux
 * échantillons de cartes, et du marketing (key art, stack, prism). Seuls
 * les trois SKU et les deux échantillons identifiés par le nom de fichier
 * / le texte éditeur entrent au catalogue.
 */

export type InkworksCapture = {
  timestamp: string;
  original: string;
};

export type InkworksSku = {
  slug: string;
  kind: SealedKind;
  category: string;
  name: string;
  art: string;
  declaredCardCount: number | null;
};

export type InkworksSampleCard = {
  file: string;
  printed: string;
  setCode: string;
  number: string;
};

export type InkworksSellSheet = {
  upc: {
    pack: string;
    display: string;
    case: string;
    album: string;
    albumCase: string;
  };
};

export type InkworksProductsLedger = {
  sourceId: string;
  lang: string;
  released: string;
  setCode: string;
  productPage: string;
  skus: InkworksSku[];
  logo: { file: string };
  sampleCards: InkworksSampleCard[];
  notIngested: { file: string; reason: string }[];
  sellSheet: InkworksSellSheet;
  captures: Record<string, InkworksCapture>;
};

const INKWORKS_LEDGER_FILE = "inkworks-products.json";
const INKWORKS_STAGING_FOLDER = "inkworks";
const INKWORKS_ART_FILE = "art.inkworks.jpg";

export function inkworksProductsPath(): string {
  return path.join(narutoRanksCuratedDir(), "sources", INKWORKS_LEDGER_FILE);
}

export function readInkworksProductsLedger(): InkworksProductsLedger {
  return JSON.parse(
    readFileSync(inkworksProductsPath(), "utf8"),
  ) as InkworksProductsLedger;
}

export function inkworksStagingDir(): string {
  return path.join(packStagingDir(NARUTO_RANKS_PACK_ID), INKWORKS_STAGING_FOLDER);
}

export function inkworksWaybackRawUrl(capture: InkworksCapture): string {
  const ts = capture.timestamp.replace(/\D/g, "");
  return `https://web.archive.org/web/${ts}id_/${capture.original}`;
}

/**
 * Tout le dump officiel : packshots, échantillons **et** le marketing.
 * Staging = cache de scrape. L'ingest choisit ensuite ce qui devient un
 * produit ou une face.
 */
export function inkworksHarvestList(
  ledger: InkworksProductsLedger = readInkworksProductsLedger(),
): { file: string; capture: InkworksCapture }[] {
  return Object.entries(ledger.captures)
    .map(([file, capture]) => ({ file, capture }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

export function inkworksSkippedFiles(
  ledger: InkworksProductsLedger = readInkworksProductsLedger(),
): string[] {
  return ledger.notIngested.map((row) => row.file);
}

export async function harvestInkworksOfficialAssets(
  opts: { force?: boolean } = {},
): Promise<{ ok: number; skip: number; fail: number }> {
  const ledger = readInkworksProductsLedger();
  const contentHash = hashNarutoCuratedFile(inkworksProductsPath());
  if (
    narutoDigArtefactFresh({
      packId: NARUTO_RANKS_PACK_ID,
      artefactId: "sealed:inkworks",
      contentHash,
      force: opts.force,
    })
  ) {
    const n = inkworksHarvestList(ledger).length;
    return { ok: 0, skip: n, fail: 0 };
  }

  const destRoot = inkworksStagingDir();
  mkdirSync(destRoot, { recursive: true });
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const { file, capture } of inkworksHarvestList(ledger)) {
    const dest = path.join(destRoot, file);
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    const url = inkworksWaybackRawUrl(capture);
    try {
      const res = await httpGet<ArrayBuffer>(url, {
        headers: { "User-Agent": UA_INKWORKS },
        responseType: "arraybuffer",
        timeout: 40_000,
        validateStatus: (status: number) => status === 200,
      });
      const data = res.data;
      if (!data || data.byteLength < 100) {
        fail += 1;
        continue;
      }
      writeFileSync(dest, Buffer.from(data));
      ok += 1;
      await new Promise((resolve) => {
        setTimeout(resolve, 400);
      });
    } catch {
      fail += 1;
    }
  }
  return { ok, skip, fail };
}

/** Packshots fournis par le propriétaire, sous `curated/products/{slug}/en/`. */
export function ninjaRanksCuratedProductsDir(): string {
  return path.join(narutoRanksCuratedDir(), "products");
}

const RECONSTRUCTED_LEDGER = "reconstructed-products.json";
const RECONSTRUCTED_SOURCE_ID = "reconstructed";

export function readNinjaRanksReconstructedArt(
  root?: string,
): Map<string, string> {
  const dir = root ?? ninjaRanksCuratedProductsDir();
  const ledgerPath = path.join(
    narutoRanksCuratedDir(),
    "sources",
    RECONSTRUCTED_LEDGER,
  );
  if (!existsSync(ledgerPath)) return new Map();
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8")) as {
    lang: string;
    products: { slug: string; art: string }[];
  };
  const lang = ledger.lang?.trim().toLowerCase();
  const found = new Map<string, string>();
  for (const product of ledger.products) {
    const file = path.join(dir, product.slug, lang, product.art);
    if (existsSync(file)) found.set(product.slug, file);
  }
  return found;
}

export function inkworksSealedSpecs(
  opts: {
    stagingDir?: string;
    curatedProductsDir?: string;
  } = {},
): { products: LocalSealedWrite[]; source: string } {
  const ledger = readInkworksProductsLedger();
  const staging = opts.stagingDir ?? inkworksStagingDir();
  const logoPath = path.join(staging, ledger.logo.file);
  /*
    Les packshots détourés priment sur les vignettes marketing du Wayback —
    `nnrwrapmed` fait 253×360 quand le PNG fourni fait 1597×2599. L'original
    éditeur n'est pas écrasé pour autant : il descend en dump à côté, comme
    l'album Coleka reste à côté de l'upscale chez Ultra Challenge.
  */
  const curatedArt = readNinjaRanksReconstructedArt(opts.curatedProductsDir);
  /*
    Le lot EN ne bascule en `reconstructed` que si **chaque** SKU a son
    packshot curé — sinon un visuel Inkworks se retrouverait nommé
    `art.reconstructed`, ce qui mentirait sur sa provenance. Même précédent
    que le pack Ultra Challenge.
  */
  const allCurated =
    ledger.skus.length > 0 &&
    ledger.skus.every((sku) => curatedArt.has(sku.slug));
  const products = ledger.skus.map((sku) => {
    const better = allCurated ? (curatedArt.get(sku.slug) ?? null) : null;
    const official = path.join(staging, sku.art);
    return {
      slug: sku.slug,
      kind: sku.kind,
      category: sku.category,
      name: sku.name,
      setCode: ledger.setCode,
      catalogueSetId: ledger.setCode,
      lang: ledger.lang,
      releaseDate: ledger.released,
      declaredCardCount: sku.declaredCardCount,
      path: ledger.productPage,
      artPath: better ?? official,
      logoPath: existsSync(logoPath) ? logoPath : null,
      extraDumps:
        better && existsSync(official)
          ? [{ source: ledger.sourceId, artPath: official }]
          : [],
    };
  });
  return {
    products,
    source: allCurated ? RECONSTRUCTED_SOURCE_ID : ledger.sourceId,
  };
}

export function ingestInkworksProducts(
  opts: {
    stagingDir?: string;
    curatedProductsDir?: string;
  } = {},
): {
  written: number;
  skipped: number;
  file: string;
} {
  const { products, source } = inkworksSealedSpecs(opts);
  return writeLocalSealedProducts({
    packId: NARUTO_RANKS_PACK_ID,
    source,
    products,
  });
}

export function installInkworksSampleFaces(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): { installed: number; skipped: string[] } {
  const ledger = readInkworksProductsLedger();
  const staging = opts.stagingDir ?? inkworksStagingDir();
  const skipped: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string | null;
  }[] = [];

  for (const sample of ledger.sampleCards) {
    const src = path.join(staging, sample.file);
    const printKey = ninjaRanksPrintKey(sample.setCode, sample.number);
    if (!printKey || !existsSync(src)) {
      skipped.push(sample.printed);
      continue;
    }
    const destDir = path.join(
      packCardsDir(NARUTO_RANKS_PACK_ID),
      sample.setCode.trim().toLowerCase(),
      "en",
      sample.number.trim().toLowerCase(),
    );
    mkdirSync(destDir, { recursive: true });
    copyFileSync(src, path.join(destDir, INKWORKS_ART_FILE));
    const capture = ledger.captures[sample.file];
    assets.push({
      printKey,
      lang: "en",
      art: INKWORKS_ART_FILE,
      sourceUrl: capture ? inkworksWaybackRawUrl(capture) : null,
    });
  }

  if (assets.length) index.writeAssets(assets);
  return { installed: assets.length, skipped };
}


// ─── Unofficial visuals (Blogger) ────────────────────────────────────────

/**
 * Photos fan du rip Dollar Tree (2010) → dumps `art.blogger` / `back.blogger`.
 *
 * Ce n'est pas l'hôte Inkworks : le sachet vert s'ajoute à côté du wrap
 * officiel jaune, SD-4 n'a pas d'échantillon éditeur. Le collage 3×3 et le
 * tin TDmonthly restent dehors.
 */

export type BloggerPackRipAsset = {
  file: string;
  url: string;
  role: "product-art" | "card-art" | "card-back";
  slug?: string;
  printed?: string;
  setCode?: string;
  number?: string;
  why?: string;
};

export type BloggerPackRipLedger = {
  sourceId: string;
  lang: string;
  referer: string;
  url: string;
  assets: BloggerPackRipAsset[];
  notIngested: { file?: string; url?: string; reason: string }[];
};

const BLOGGER_LEDGER_FILE = "blogger-pack-rip.json";
const BLOGGER_STAGING_FOLDER = "blogger-pack-rip";

export function bloggerPackRipPath(): string {
  return path.join(narutoRanksCuratedDir(), "sources", BLOGGER_LEDGER_FILE);
}

export function readBloggerPackRipLedger(): BloggerPackRipLedger {
  return JSON.parse(
    readFileSync(bloggerPackRipPath(), "utf8"),
  ) as BloggerPackRipLedger;
}

export function bloggerPackRipStagingDir(): string {
  return path.join(packStagingDir(NARUTO_RANKS_PACK_ID), BLOGGER_STAGING_FOLDER);
}

export function bloggerPackRipSkippedReasons(
  ledger: BloggerPackRipLedger = readBloggerPackRipLedger(),
): string[] {
  return ledger.notIngested.map((row) => row.reason);
}

async function downloadBloggerImage(
  url: string,
  referer: string,
): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA_SAFARI, Referer: referer },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (status: number) => status === 200,
    });
    const data = res.data;
    if (!data || data.byteLength < 100) return null;
    return Buffer.from(data);
  } catch {
    return null;
  }
}

export async function harvestBloggerPackRip(
  opts: { force?: boolean } = {},
): Promise<{ ok: number; skip: number; fail: number }> {
  const ledger = readBloggerPackRipLedger();
  const destRoot = bloggerPackRipStagingDir();
  mkdirSync(destRoot, { recursive: true });
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const asset of ledger.assets) {
    const dest = path.join(destRoot, asset.file);
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    const buf = await downloadBloggerImage(asset.url, ledger.referer);
    if (!buf) {
      fail += 1;
      continue;
    }
    writeFileSync(dest, buf);
    ok += 1;
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
  }
  return { ok, skip, fail };
}

function dumpName(role: "art" | "back", source: string, src: string): string {
  const ext = path.extname(src).toLowerCase() || ".jpg";
  return `${role}.${source}${ext === ".jpeg" ? ".jpg" : ext}`;
}

export function installBloggerPackRip(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): { cards: number; products: number; backs: number; skipped: string[] } {
  const ledger = readBloggerPackRipLedger();
  const staging = opts.stagingDir ?? bloggerPackRipStagingDir();
  const skipped: string[] = [];
  const cardAssets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string | null;
  }[] = [];
  let products = 0;
  let backs = 0;
  const lang = ledger.lang?.trim().toLowerCase();

  for (const asset of ledger.assets) {
    const src = path.join(staging, asset.file);
    if (!existsSync(src)) {
      skipped.push(asset.file);
      continue;
    }
    if (asset.role === "product-art") {
      const slug = asset.slug?.trim();
      if (!slug) {
        skipped.push(asset.file);
        continue;
      }
      const destDir = path.join(
        packSealedProductsDir(NARUTO_RANKS_PACK_ID),
        slug,
        lang,
      );
      mkdirSync(destDir, { recursive: true });
      copyFileSync(
        src,
        path.join(destDir, dumpName("art", ledger.sourceId, src)),
      );
      products += 1;
      continue;
    }

    const setCode = asset.setCode?.trim().toLowerCase();
    const number = asset.number?.trim().toLowerCase();
    const printKey =
      setCode && number ? ninjaRanksPrintKey(setCode, number) : null;
    if (!setCode || !number || !printKey) {
      skipped.push(asset.printed ?? asset.file);
      continue;
    }
    const destDir = path.join(
      packCardsDir(NARUTO_RANKS_PACK_ID),
      setCode,
      lang,
      number,
    );
    mkdirSync(destDir, { recursive: true });
    if (asset.role === "card-back") {
      copyFileSync(
        src,
        path.join(destDir, dumpName("back", ledger.sourceId, src)),
      );
      backs += 1;
      continue;
    }
    const art = dumpName("art", ledger.sourceId, src);
    copyFileSync(src, path.join(destDir, art));
    cardAssets.push({
      printKey,
      lang,
      art,
      sourceUrl: asset.url,
    });
  }

  if (cardAssets.length) index.writeAssets(cardAssets);
  return {
    cards: cardAssets.length,
    products,
    backs,
    skipped,
  };
}


// ─── Imadoki sheets ──────────────────────────────────────────────────────

/**
 * Moisson et découpe des planches Imadoki.
 *
 * `harvest` descend les planches dans le staging ; `install` les découpe et
 * pose une face par carte sous `cards/{set}/it/{numéro}/art.imadoki.jpg`.
 * La grille est détectée sur chaque planche, jamais codée en dur — voir
 * `parseImadokiSheets`. Chaque case est ensuite recadrée avec
 * `trimLightImageMargins` pour retirer les marges blanches internes.
 */

const IMADOKI_STAGING_FOLDER = "imadoki";

/** Bandes égales quand la planche n'a pas de gouttières (NS paysage). */
function equalAxis(size: number, parts: number): [number, number][] {
  const cell = Math.floor(size / parts);
  const cuts: [number, number][] = [];
  for (let i = 0; i < parts; i += 1) {
    const start = i * cell;
    const end = i === parts - 1 ? size : start + cell;
    cuts.push([start, end]);
  }
  return cuts;
}

function sheetGrid(
  sheet: ImadokiSheet,
  colWhite: number[],
  rowWhite: number[],
  width: number,
  height: number,
): { cols: [number, number][]; rows: [number, number][] } | null {
  if (sheet.gridMode === "equal") {
    return {
      cols: equalAxis(width, sheet.columns),
      rows: equalAxis(height, sheet.rows),
    };
  }
  const cols = splitAxis(
    colWhite.map((v) => v / height),
    sheet.columns,
  );
  const rows = splitAxis(
    rowWhite.map((v) => v / width),
    sheet.rows,
  );
  if (cols && rows) return { cols, rows };
  return {
    cols: equalAxis(width, sheet.columns),
    rows: equalAxis(height, sheet.rows),
  };
}

/** Au-delà de cette proportion de blanc, la case est un emplacement vide. */
const BLANK_RATIO = 0.97;
/** Scans Imadoki : fond gris clair autour de la carte, pas du blanc pur. */
const IMADOKI_TRIM_LIGHT_LUMINANCE = 220;

export function imadokiStagingDir(): string {
  return path.join(packStagingDir(NARUTO_RANKS_PACK_ID), IMADOKI_STAGING_FOLDER);
}

export type ImadokiHarvest = { ok: number; skip: number; fail: number };

export async function harvestImadokiSheets(
  opts: { force?: boolean } = {},
): Promise<ImadokiHarvest> {
  const dir = imadokiStagingDir();
  mkdirSync(dir, { recursive: true });
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const sheet of IMADOKI_SHEETS) {
    const dest = path.join(dir, sheet.file);
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    try {
      const res = await httpGet<ArrayBuffer>(imadokiSheetUrl(sheet.file), {
        headers: { "User-Agent": UA_CHROME, Referer: imadokiGalleryUrl() },
        responseType: "arraybuffer",
        timeout: 40_000,
        validateStatus: (status: number) => status === 200,
      });
      const data = res.data;
      if (!data || data.byteLength < 2_000) {
        fail += 1;
        continue;
      }
      writeFileSync(dest, Buffer.from(data));
      ok += 1;
    } catch {
      fail += 1;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { ok, skip, fail };
}

export type ImadokiCut = {
  slot: number;
  setCode: string;
  number: string;
  buffer: Buffer;
};

export type ImadokiSheetCut = {
  cuts: ImadokiCut[];
  /** Cases refusées, avec leur raison. */
  rejected: { slot: number; reason: string }[];
};

/**
 * Découpe une planche selon sa grille détectée.
 *
 * Rejette la planche entière si la grille ne se lit pas, et chaque case dont
 * l'emplacement est vide — la planche SD en a un, à la place de `sd-0004`.
 */
export async function cutImadokiSheet(
  bytes: Buffer,
  sheet: ImadokiSheet,
): Promise<ImadokiSheetCut> {
  const image = sharp(bytes);
  const { width, height } = await image.metadata();
  if (!width || !height) {
    return { cuts: [], rejected: [{ slot: -1, reason: "planche illisible" }] };
  }
  const { data } = await image
    .clone()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const colWhite: number[] = new Array(width).fill(0);
  const rowWhite: number[] = new Array(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[y * width + x]! > 225) {
        colWhite[x] += 1;
        rowWhite[y] += 1;
      }
    }
  }
  const grid = sheetGrid(sheet, colWhite, rowWhite, width, height);
  if (!grid) {
    return {
      cuts: [],
      rejected: [{ slot: -1, reason: "grille illisible" }],
    };
  }
  const { cols, rows } = grid;

  const cuts: ImadokiCut[] = [];
  const rejected: ImadokiSheetCut["rejected"] = [];
  let slot = -1;
  for (const [top, bottom] of rows) {
    for (const [left, right] of cols) {
      slot += 1;
      const target = sheet.slots[slot];
      if (!target) continue;
      let white = 0;
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          if (data[y * width + x]! > 225) white += 1;
        }
      }
      const area = (bottom - top) * (right - left);
      if (area <= 0 || white / area > BLANK_RATIO) {
        rejected.push({
          slot,
          reason: "emplacement vide sur la planche — aucune carte à découper",
        });
        continue;
      }
      const extracted = await sharp(bytes)
        .extract({
          left,
          top,
          width: right - left,
          height: bottom - top,
        })
        .jpeg({ quality: 92 })
        .toBuffer();
      const trimmed = await trimLightImageMargins(extracted, {
        lightLuminanceThreshold: IMADOKI_TRIM_LIGHT_LUMINANCE,
      });
      const buffer = await sharp(trimmed).jpeg({ quality: 92 }).toBuffer();
      cuts.push({
        slot,
        setCode: target.setCode,
        number: target.number,
        buffer,
      });
    }
  }
  return { cuts, rejected };
}

export type ImadokiInstall = {
  faces: number;
  sheets: number;
  rejected: { file: string; slot: number; reason: string }[];
};

export async function installImadokiSheets(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): Promise<ImadokiInstall> {
  const dir = opts.stagingDir ?? imadokiStagingDir();
  const rejected: ImadokiInstall["rejected"] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string | null;
  }[] = [];
  let sheets = 0;

  for (const sheet of IMADOKI_SHEETS) {
    const src = path.join(dir, sheet.file);
    if (!existsSync(src)) continue;
    const { cuts, rejected: bad } = await cutImadokiSheet(
      readFileSync(src),
      sheet,
    );
    for (const row of bad) {
      rejected.push({ file: sheet.file, slot: row.slot, reason: row.reason });
    }
    if (!cuts.length) continue;
    sheets += 1;
    for (const cut of cuts) {
      const printKey = ninjaRanksPrintKey(cut.setCode, cut.number);
      if (!printKey) continue;
      const destDir = path.join(
        packCardsDir(NARUTO_RANKS_PACK_ID),
        cut.setCode,
        IMADOKI_LANG,
        cut.number,
      );
      mkdirSync(destDir, { recursive: true });
      const art = `art.${IMADOKI_SOURCE_ID}.jpg`;
      writeFileSync(path.join(destDir, art), cut.buffer);
      assets.push({
        printKey,
        lang: IMADOKI_LANG,
        art,
        sourceUrl: imadokiSheetUrl(sheet.file),
      });
    }
  }

  if (assets.length) index.writeAssets(assets);
  return { faces: assets.length, sheets, rejected };
}


// ─── Arcade Game Cards ───────────────────────────────────────────────────

/**
 * Moisson et pose des photos arcadegamecards — l'édition américaine.
 *
 * Deux temps, comme le reste du pack. Le listing est lu par
 * `parseArcadeListing`, qui exige trois signaux concordants ; ce module ne fait
 * que descendre les octets et les poser.
 */

const ARCADE_STAGING_FOLDER = "arcadegamecards";
const ARCADE_LEDGER_FILE = "arcadegamecards.json";
const ARCADE_ARTEFACT = "faces:arcadegamecards-ranks";

export function arcadeGameCardsContentHash(): string {
  return hashNarutoCuratedJson({
    aliases: readArcadeGameCardsLedger().vendorTitleAliases ?? [],
    urls: arcadeListingUrls(),
  });
}

export function arcadeStagingDir(): string {
  return path.join(packStagingDir(NARUTO_RANKS_PACK_ID), ARCADE_STAGING_FOLDER);
}

export function readArcadeGameCardsLedger(): {
  vendorTitleAliases?: {
    setCode: string;
    number: string;
    vendorTitles: string[];
  }[];
} {
  return JSON.parse(
    readFileSync(
      path.join(narutoRanksCuratedDir(), "sources", ARCADE_LEDGER_FILE),
      "utf8",
    ),
  );
}

/** La checklist Inkworks sert de troisième signal : le nom doit tomber juste. */
export function inkworksNameLookup(): (
  setCode: string,
  number: string,
) => string | null {
  const byRef = new Map<string, string>();
  for (const card of readInkworksChecklist().cards) {
    byRef.set(
      `${card.setCode.trim().toLowerCase()}-${card.number.trim().toLowerCase()}`,
      card.name,
    );
  }
  return (setCode, number) => byRef.get(`${setCode}-${number}`) ?? null;
}

export function createArcadeNameCheck(): ArcadeNameCheck {
  const nameOf = inkworksNameLookup();
  const aliases = new Map<string, readonly string[]>();
  for (const row of readArcadeGameCardsLedger().vendorTitleAliases ?? []) {
    aliases.set(
      `${row.setCode.trim().toLowerCase()}-${row.number.trim().toLowerCase()}`,
      row.vendorTitles,
    );
  }
  return (setCode, number, vendorName) => {
    const expected = nameOf(setCode, number);
    if (!expected) return false;
    if (namesAgree(vendorName, expected)) return true;
    const key = `${setCode.trim().toLowerCase()}-${number.trim().toLowerCase()}`;
    return (aliases.get(key) ?? []).some((alias) =>
      namesAgree(vendorName, alias),
    );
  };
}

export function arcadeStagingFile(card: ArcadeCard): string {
  return `${card.setCode}-${card.number}.jpg`;
}

export function arcadeStagingBackFile(card: ArcadeCard): string {
  return `${card.setCode}-${card.number}-back.jpg`;
}

export type ArcadeHarvest = {
  pages: number;
  cards: number;
  ok: number;
  skip: number;
  fail: number;
  backOk: number;
  backSkip: number;
  backFail: number;
  rejected: { printed: string; name: string; reason: string }[];
};

export async function harvestArcadeGameCards(
  opts: { force?: boolean } = {},
): Promise<ArcadeHarvest> {
  const contentHash = arcadeGameCardsContentHash();
  if (
    narutoDigArtefactFresh({
      packId: NARUTO_RANKS_PACK_ID,
      artefactId: ARCADE_ARTEFACT,
      contentHash,
      force: opts.force,
    })
  ) {
    return {
      pages: 0,
      cards: 0,
      ok: 0,
      skip: 0,
      fail: 0,
      backOk: 0,
      backSkip: 0,
      backFail: 0,
      rejected: [],
    };
  }

  const dir = arcadeStagingDir();
  mkdirSync(dir, { recursive: true });
  const nameCheck = createArcadeNameCheck();
  const found = new Map<string, ArcadeCard>();
  const rejected: ArcadeHarvest["rejected"] = [];
  let pages = 0;

  for (const [i, url] of arcadeListingUrls().entries()) {
    const cache = path.join(dir, `listing-${i}.html`);
    let html: string | null = null;
    if (!opts.force && existsSync(cache)) {
      const cached = readFileSync(cache, "utf8");
      if (cached.length > 1_000) html = cached;
    }
    if (!html) {
      html = await fetchTextWithFlareFallback(url, {
        headers: { "User-Agent": UA_CHROME },
      });
      if (html && html.length > 1_000) writeFileSync(cache, html, "utf8");
    }
    if (!html) continue;
    pages += 1;
    const parsed = parseArcadeListing(html, nameCheck);
    for (const card of parsed.cards) {
      const key = `${card.setCode}-${card.number}`;
      if (!found.has(key)) found.set(key, card);
    }
    rejected.push(...parsed.rejected);
    await new Promise((r) => setTimeout(r, 500));
  }

  let ok = 0;
  let skip = 0;
  let fail = 0;
  let backOk = 0;
  let backSkip = 0;
  let backFail = 0;
  for (const card of found.values()) {
    const dest = path.join(dir, arcadeStagingFile(card));
    let frontBuf: Buffer | null = null;
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      frontBuf = readFileSync(dest);
    } else {
      try {
        const res = await httpGet<ArrayBuffer>(card.imageUrl, {
          headers: { "User-Agent": UA_CHROME, Referer: arcadeListingUrls()[0]! },
          responseType: "arraybuffer",
          timeout: 40_000,
          validateStatus: (status: number) => status === 200,
        });
        const data = res.data;
        if (!data || data.byteLength < 2_000) {
          fail += 1;
        } else {
          frontBuf = Buffer.from(data);
          writeFileSync(dest, frontBuf);
          ok += 1;
        }
      } catch {
        fail += 1;
      }
    }

    const backDest = path.join(dir, arcadeStagingBackFile(card));
    if (!opts.force && existsSync(backDest)) {
      backSkip += 1;
    } else if (!frontBuf) {
      backFail += 1;
    } else {
      try {
        const res = await httpGet<ArrayBuffer>(
          arcadeBackImageUrl(card.imageUrl),
          {
            headers: { "User-Agent": UA_CHROME, Referer: arcadeListingUrls()[0]! },
            responseType: "arraybuffer",
            timeout: 40_000,
            validateStatus: (status: number) => status === 200,
          },
        );
        const data = res.data;
        if (!data || data.byteLength < 2_000) {
          backFail += 1;
        } else {
          const backBuf = Buffer.from(data);
          if (backBuf.equals(frontBuf)) {
            backFail += 1;
          } else {
            writeFileSync(backDest, backBuf);
            backOk += 1;
          }
        }
      } catch {
        backFail += 1;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return {
    pages,
    cards: found.size,
    ok,
    skip,
    fail,
    backOk,
    backSkip,
    backFail,
    rejected,
  };
}

export type ArcadeInstall = { faces: number; backs: number; missing: string[] };

export function installArcadeGameCards(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): ArcadeInstall {
  const dir = opts.stagingDir ?? arcadeStagingDir();
  if (!existsSync(dir)) return { faces: 0, backs: 0, missing: [] };
  const nameCheck = createArcadeNameCheck();
  const missing: string[] = [];
  const assetsByKey = new Map<
    string,
    {
      printKey: string;
      lang: string;
      art?: string;
      back?: string;
      sourceUrl: string | null;
    }
  >();

  for (const [i] of arcadeListingUrls().entries()) {
    const cache = path.join(dir, `listing-${i}.html`);
    if (!existsSync(cache)) continue;
    const { cards } = parseArcadeListing(
      readFileSync(cache, "utf8"),
      nameCheck,
    );
    for (const card of cards) {
      const src = path.join(dir, arcadeStagingFile(card));
      const backSrc = path.join(dir, arcadeStagingBackFile(card));
      const printKey = ninjaRanksPrintKey(card.setCode, card.number);
      if (!existsSync(src) || !printKey) {
        missing.push(`${card.setCode}-${card.number}`);
        continue;
      }
      const destDir = path.join(
        packCardsDir(NARUTO_RANKS_PACK_ID),
        card.setCode,
        ARCADE_LANG,
        card.number,
      );
      mkdirSync(destDir, { recursive: true });
      const art = `art.${ARCADE_SOURCE_ID}.jpg`;
      copyFileSync(src, path.join(destDir, art));

      let back: string | undefined;
      if (existsSync(backSrc)) {
        back = `back.${ARCADE_SOURCE_ID}.jpg`;
        copyFileSync(backSrc, path.join(destDir, back));
      }

      const assetKey = `${printKey}:${ARCADE_LANG}`;
      const existing = assetsByKey.get(assetKey);
      assetsByKey.set(assetKey, {
        printKey,
        lang: ARCADE_LANG,
        art: existing?.art ?? art,
        back: back ?? existing?.back,
        sourceUrl: card.imageUrl,
      });
    }
  }

  const assets = [...assetsByKey.values()];
  if (assets.length) index.writeAssets(assets);
  if (missing.length === 0 && assets.length > 0) {
    promoteAndPurgeNarutoDig({
      packId: NARUTO_RANKS_PACK_ID,
      artefactId: ARCADE_ARTEFACT,
      stagingRel: ARCADE_STAGING_FOLDER,
      contentHash: arcadeGameCardsContentHash(),
    });
  }
  return {
    faces: assets.length,
    backs: assets.filter((a) => a.back).length,
    missing,
  };
}

