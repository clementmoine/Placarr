/**
 * Archive AnimeCollection Ninja Ranks (`ids=200`) — grille complète + HD + dos.
 *
 * Source principale FR : rectos `h3000` (sinon h400), versos via détail AJAX.
 * Ranking catalogue : `animecollection` au-dessus de Coleka.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { NARUTO_RANKS_PACK_ID, narutoRanksCuratedDir } from "./pack";
import { ninjaRanksPrintKey } from "./printKey";

const LEDGER_FILE = "animecollection.json";
const STAGING_FOLDER = "animecollection-faces";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

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
  return path.join(narutoRanksCuratedDir(), "sources", LEDGER_FILE);
}

export function readAnimeCollectionRanksLedger(): AnimeCollectionRanksLedger {
  return JSON.parse(
    readFileSync(animeCollectionRanksLedgerPath(), "utf8"),
  ) as AnimeCollectionRanksLedger;
}

export function animeCollectionRanksStagingDir(): string {
  return path.join(packStagingDir(NARUTO_RANKS_PACK_ID), STAGING_FOLDER);
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

async function downloadImage(
  url: string,
  referer: string,
): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: referer },
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

async function downloadPrefer(
  urls: readonly string[],
  referer: string,
): Promise<Buffer | null> {
  for (const url of urls) {
    const buf = await downloadImage(url, referer);
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
  const ledger = readAnimeCollectionRanksLedger();
  const referer = ledger.url;
  let faces = ledger.faces ?? [];

  if (opts.refreshLedger || opts.force || !faces.length) {
    const res = await httpGet(ledger.url, {
      headers: { "User-Agent": UA },
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
          headers: { "User-Agent": UA, Referer: referer },
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
      const buf = await downloadPrefer(
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
    const backBuf = await downloadPrefer(
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
  return { faces: faceCount, backs: backCount, missing };
}
