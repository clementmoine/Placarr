/**
 * Italian Carddass S1–S6 singles from the old Magento catalog (Wayback).
 * Titles + 300×375 shop thumbnails with Italian card text.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { upsertNarutoAppearances } from "./migrateCardLayout";
import { narutoCardAbsDir } from "./narutoCardDisk";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "./narutoFaceBytes";
import { NARUTO_PACK_ID } from "./packs";
import {
  cardgameclubItCuratedCards,
  mergeCardgameclubItCardsIntoIndex,
  parseCardgameclubItListing,
  parseCardgameclubItListingFaces,
  type CardgameclubItCard,
  type CardgameclubItFace,
} from "./parseCardgameclubIt";
import type { NarutoPrintRow, NarutoTitleRow } from "./indexStore";

export const NARUTO_STAGING_CGC_IT = path.join("staging", "cardgameclub-it");
export const CARDGAMECLUB_IT_LANG = "it";
export const CARDGAMECLUB_IT_FACE_SOURCE = "cardgameclub" as const;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 400;
const MIN_FACE_BYTES = 2_000;
/** Magento cache JPEGs 404; a 45s Wayback hang per card killed the 2400s extract. */
export const CARDGAMECLUB_IT_FACE_TIMEOUT_MS = 8_000;
/** After this many consecutive JPEG misses, the rest of the Magento cache is dead. */
export const CARDGAMECLUB_IT_FACE_GIVE_UP_AFTER = 3;

export function cardgameclubItShouldAbortFaceDownloads(
  consecutiveFails: number,
): boolean {
  return consecutiveFails >= CARDGAMECLUB_IT_FACE_GIVE_UP_AFTER;
}

export const CARDGAMECLUB_IT_SERIES = [
  {
    setCode: "s1",
    slug: "serie-1-la-forza-della-foglia",
    pages: 8,
    wayback: "20220701234852",
  },
  {
    setCode: "s2",
    slug: "serie-2-le-spire-del-serpente",
    pages: 7,
    wayback: "20201030165412",
  },
  {
    setCode: "s3",
    slug: "serie-3-la-maledizione-della-sabbia",
    pages: 6,
    wayback: "20201026162215",
  },
  {
    setCode: "s4",
    slug: "serie-4-vendetta-e-redenzione",
    pages: 6,
    wayback: "20220527192328",
  },
  {
    setCode: "s5",
    slug: "serie-5-l-eredita-del-sogno",
    pages: 6,
    wayback: "20201031132030",
  },
  {
    setCode: "s6",
    slug: "serie-6-rivalita-eterna",
    pages: 6,
    wayback: "20220528162336",
  },
] as const;

const LIVE_HOSTS = [
  "https://www.cardgame-club.it",
  "https://www.cardgameclub.it",
] as const;

const WAYBACK_YEARS = ["2024", "2023", "2022", "2021", "2020"] as const;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

export function cardgameclubItLedgerPath(packDir?: string): string {
  return path.join(packDir ?? packRoot(), NARUTO_STAGING_CGC_IT, "cards.json");
}

export function cardgameclubItFacesLedgerPath(packDir?: string): string {
  return path.join(packDir ?? packRoot(), NARUTO_STAGING_CGC_IT, "faces.json");
}

export function loadCardgameclubItLedger(
  packDir?: string,
): CardgameclubItCard[] {
  const file = cardgameclubItLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter((row): row is CardgameclubItCard => {
      if (!row || typeof row !== "object") return false;
      const card = row as CardgameclubItCard;
      return (
        typeof card.number === "string" &&
        typeof card.name === "string" &&
        typeof card.setCode === "string"
      );
    });
  } catch {
    return [];
  }
}

export function mergeCardgameclubItIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  packDir?: string;
}) {
  const byNumber = new Map<string, CardgameclubItCard>();
  for (const row of [
    ...cardgameclubItCuratedCards(),
    ...loadCardgameclubItLedger(input.packDir),
  ]) {
    if (!byNumber.has(row.number)) byNumber.set(row.number, row);
  }
  return mergeCardgameclubItCardsIntoIndex({
    prints: input.prints,
    titles: input.titles,
    cards: [...byNumber.values()],
  });
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await httpGet<string>(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      responseType: "text",
      timeout: 45_000,
      validateStatus: (status) => status === 200,
    });
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    return html.length > 800 ? html : null;
  } catch {
    return null;
  }
}

function listingPath(slug: string, page: number): string {
  const base = `/brand/naruto/carte-singole-it/${slug}.html`;
  return page <= 1 ? base : `${base}?p=${page}`;
}

function waybackListingUrl(snapshot: string, rel: string): string {
  return `https://web.archive.org/web/${snapshot}/https://www.cardgame-club.it${rel}`;
}

function listingHasCards(html: string, setCode: string): boolean {
  return (
    parseCardgameclubItListing(html, setCode).length > 0 ||
    parseCardgameclubItListingFaces(html, setCode).length > 0
  );
}

async function fetchListingHtml(
  series: (typeof CARDGAMECLUB_IT_SERIES)[number],
  page: number,
  delayMs: number,
): Promise<string | null> {
  const rel = listingPath(series.slug, page);
  let html = await fetchHtml(waybackListingUrl(series.wayback, rel));
  if (html && listingHasCards(html, series.setCode)) {
    return html;
  }
  for (const host of LIVE_HOSTS) {
    html = await fetchHtml(`${host}${rel}`);
    if (html && listingHasCards(html, series.setCode)) {
      return html;
    }
  }
  for (const year of WAYBACK_YEARS) {
    html = await fetchHtml(
      `https://web.archive.org/web/${year}/https://www.cardgame-club.it${rel}`,
    );
    if (html && listingHasCards(html, series.setCode)) {
      return html;
    }
    await sleep(delayMs);
  }
  return null;
}

async function downloadFace(url: string): Promise<Buffer | null> {
  const candidates = [url];
  if (url.includes("web.archive.org/web/") && url.includes("im_/")) {
    candidates.push(url.replace("im_/", "id_/"));
  }
  for (const tryUrl of candidates) {
    try {
      const res = await httpGet<ArrayBuffer>(tryUrl, {
        headers: {
          "User-Agent": UA,
          Accept: "image/jpeg,image/*,*/*;q=0.8",
        },
        responseType: "arraybuffer",
        timeout: CARDGAMECLUB_IT_FACE_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: (status) => status === 200,
      });
      const buf = Buffer.from(res.data as ArrayBuffer);
      if (extFromMagic(buf) !== ".jpg") continue;
      if (buf.byteLength >= MIN_FACE_BYTES) return buf;
    } catch {
      // try id_ fallback or next candidate
    }
  }
  return null;
}

export type ScrapeCardgameclubItOptions = {
  force?: boolean;
  delayMs?: number;
  limit?: number;
  root?: string;
  /** Titles only — skip thumbnail download. */
  titlesOnly?: boolean;
  /** Re-download JPEGs from staging/cardgameclub-it/faces.json (skip listing crawl). */
  redownloadOnly?: boolean;
};

function loadCardgameclubItFacesLedger(packDir?: string): CardgameclubItFace[] {
  const file = cardgameclubItFacesLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { faces?: unknown };
    if (!Array.isArray(raw.faces)) return [];
    return raw.faces.filter((row): row is CardgameclubItFace => {
      if (!row || typeof row !== "object") return false;
      const face = row as CardgameclubItFace;
      return (
        typeof face.number === "string" &&
        typeof face.imageUrl === "string" &&
        typeof face.setCode === "string"
      );
    });
  } catch {
    return [];
  }
}

export async function scrapeCardgameclubItTitles(
  opts: ScrapeCardgameclubItOptions = {},
): Promise<{ written: number }> {
  const packDir = opts.root ? packRoot(opts.root) : undefined;
  const dest = cardgameclubItLedgerPath(packDir);
  if (!opts.force && existsSync(dest)) {
    const existing = loadCardgameclubItLedger(packDir);
    if (existing.length) {
      console.log(`── CGC IT titles : ${existing.length} déjà en staging`);
      return { written: existing.length };
    }
  }
  const delay = opts.delayMs ?? DEFAULT_DELAY_MS;
  const byNumber = new Map<string, CardgameclubItCard>();

  for (const series of CARDGAMECLUB_IT_SERIES) {
    for (let page = 1; page <= series.pages; page += 1) {
      const html = await fetchListingHtml(series, page, delay);
      if (!html) continue;
      for (const row of parseCardgameclubItListing(html, series.setCode)) {
        if (!byNumber.has(row.number)) byNumber.set(row.number, row);
      }
      await sleep(delay);
    }
    console.log(
      `   CGC IT ${series.setCode} → ${[...byNumber.values()].filter((c) => c.setCode === series.setCode).length} titres`,
    );
  }

  const cards = [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    `${JSON.stringify(
      {
        source: "cardgame-club.it Magento / Wayback",
        generatedAt: new Date().toISOString(),
        ingest: "titles",
        cards,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`── CGC IT titles : ${cards.length} écrits`);
  return { written: cards.length };
}

export async function scrapeCardgameclubItFaces(
  opts: ScrapeCardgameclubItOptions = {},
): Promise<{
  listed: number;
  downloaded: number;
  skipped: number;
  failed: number;
}> {
  const rootDir = packRoot(opts.root);
  const cardsDir = path.join(rootDir, "cards");
  const staging = path.join(rootDir, NARUTO_STAGING_CGC_IT, "faces");
  mkdirSync(staging, { recursive: true });
  const delay = opts.delayMs ?? DEFAULT_DELAY_MS;
  const force = opts.force === true;
  let faces: CardgameclubItFace[];
  let redownloadOnly = opts.redownloadOnly === true;
  if (redownloadOnly && !loadCardgameclubItFacesLedger(rootDir).length) {
    console.warn("── CGC IT : faces.json absent — crawl listings d'abord");
    redownloadOnly = false;
  }

  console.log("── CGC IT Wayback → art.cardgameclub (locale it)");
  const existingFaces = loadCardgameclubItFacesLedger(rootDir);
  if (!redownloadOnly && existingFaces.length && !force) {
    redownloadOnly = true;
    console.log(
      `── CGC IT faces ledger : ${existingFaces.length} URLs (skip listing crawl)`,
    );
  }
  if (!redownloadOnly) {
    await scrapeCardgameclubItTitles({ ...opts, force: opts.force === true });

    const byNumber = new Map<string, CardgameclubItFace>();
    for (const series of CARDGAMECLUB_IT_SERIES) {
      for (let page = 1; page <= series.pages; page += 1) {
        const html = await fetchListingHtml(series, page, delay);
        if (!html) continue;
        for (const row of parseCardgameclubItListingFaces(
          html,
          series.setCode,
        )) {
          if (!byNumber.has(row.number)) byNumber.set(row.number, row);
        }
        await sleep(delay);
      }
      console.log(
        `   CGC IT faces ${series.setCode} → ${[...byNumber.values()].filter((c) => c.setCode === series.setCode).length}`,
      );
    }
    faces = [...byNumber.values()].sort((a, b) =>
      a.number.localeCompare(b.number),
    );
    writeFileSync(
      cardgameclubItFacesLedgerPath(rootDir),
      `${JSON.stringify(
        {
          source: "cardgame-club.it Magento / Wayback",
          lang: CARDGAMECLUB_IT_LANG,
          generatedAt: new Date().toISOString(),
          ingest: "faces",
          faces,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    faces = loadCardgameclubItFacesLedger(rootDir);
    console.log(`── CGC IT faces ledger : ${faces.length} URLs`);
  }

  if (opts.limit && opts.limit > 0) faces = faces.slice(0, opts.limit);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let consecutiveFails = 0;
  const appearances: { diskId: string; lang: string; appearanceSet: string }[] =
    [];

  for (let i = 0; i < faces.length; i += 1) {
    const face = faces[i]!;
    const cardDir = narutoCardAbsDir(
      cardsDir,
      face.number,
      CARDGAMECLUB_IT_LANG,
    );
    if (!cardDir) {
      failed += 1;
      continue;
    }
    if (
      !force &&
      existingNarutoArtForSource(cardDir, CARDGAMECLUB_IT_FACE_SOURCE)
    ) {
      skipped += 1;
      consecutiveFails = 0;
      appearances.push({
        diskId: face.number,
        lang: CARDGAMECLUB_IT_LANG,
        appearanceSet: face.setCode,
      });
      continue;
    }
    if (cardgameclubItShouldAbortFaceDownloads(consecutiveFails)) {
      const rest = faces.length - i;
      failed += rest;
      console.warn(
        `── CGC IT : cache Magento JPEG absent — skip ${rest} remaining (Wayback 404)`,
      );
      break;
    }
    const buf = await downloadFace(face.imageUrl);
    if (!buf) {
      consecutiveFails += 1;
      failed += 1;
      console.log(`CGC IT ${face.number} FAIL`);
      continue;
    }
    consecutiveFails = 0;
    const stagingFile = path.join(staging, face.setCode, `${face.number}.jpg`);
    mkdirSync(path.dirname(stagingFile), { recursive: true });
    writeFileSync(stagingFile, buf);
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: CARDGAMECLUB_IT_FACE_SOURCE,
      lang: CARDGAMECLUB_IT_LANG,
      force,
    });
    appearances.push({
      diskId: face.number,
      lang: CARDGAMECLUB_IT_LANG,
      appearanceSet: face.setCode,
    });
    if (saved === "skip") skipped += 1;
    else downloaded += 1;
  }

  if (appearances.length) upsertNarutoAppearances(rootDir, appearances);
  console.log(
    JSON.stringify({
      cardgameclubItFaces: true,
      listed: faces.length,
      downloaded,
      skipped,
      failed,
    }),
  );
  return { listed: faces.length, downloaded, skipped, failed };
}
