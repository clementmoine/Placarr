/**
 * Install カードショップ アヴァロン shop photos as `art.avalon.*`.
 *
 * The JA hole is the catalogue's biggest (705 named prints without a face on
 * 2026-08-19) and every archive host is exhausted. This shop is the only live
 * one that names each card by its printed ref, so it can be joined without
 * guessing. What it serves is a 265×400 photo, not a scan: it ranks below
 * nikita / carddas / suruga and is only worth writing where nothing else is.
 *
 * Bounded on purpose — one category page, no crawl of the shop.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import {
  narutoCardDiskFolder,
  narutoDiskCardId,
  parseNarutoCollector,
} from "./collectorIdentity";
import { narutoCardAbsDir } from "./narutoCardDisk";
import { NARUTO_PACK_ID } from "./packs";
import {
  AVALON_LANG,
  AVALON_ORIGIN,
  avalonFullImageUrl,
  avalonListingUrl,
  avalonProductUrl,
  decodeAvalonHtml,
  parseAvalonNarutoListing,
  type AvalonCard,
} from "./parseAvalonShop";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "./narutoFaceBytes";

export const NARUTO_STAGING_AVALON = path.join("staging", "avalon-shop");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 250;
const MIN_BYTES = 3_000;

export type ScrapeAvalonOptions = {
  force?: boolean;
  limit?: number;
  delayMs?: number;
  root?: string;
  /** Write staging + ledger, never touch `cards/`. */
  stagingOnly?: boolean;
};

export type AvalonInstallRow = AvalonCard & { diskId: string };

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

/** Rows whose printed ref resolves to a disk id we already mint. */
export function avalonInstallRows(
  cards: readonly AvalonCard[],
): AvalonInstallRow[] {
  const rows: AvalonInstallRow[] = [];
  for (const card of cards) {
    const diskId = narutoDiskCardId(card.printedRef);
    if (!diskId) continue;
    rows.push({ ...card, diskId });
  }
  return rows;
}

async function fetchListing(): Promise<string | null> {
  try {
    const res = await httpGet<ArrayBuffer>(avalonListingUrl(), {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,*/*",
        "Accept-Language": "ja,en;q=0.8",
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const html = decodeAvalonHtml(new Uint8Array(res.data as ArrayBuffer));
    if (html.length < 400) return null;
    return html;
  } catch (error) {
    const err = error as { message?: string; response?: { status?: number } };
    console.warn(
      `── JA avalon : listing HTTP ${err.response?.status ?? "fail"} — ${err.message ?? error}`,
    );
    return null;
  }
}

async function downloadPhoto(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "image/*,*/*",
        Referer: avalonListingUrl(),
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= MIN_BYTES ? buf : null;
  } catch {
    return null;
  }
}

export async function scrapeAvalonNarutoFaces(
  opts: ScrapeAvalonOptions = {},
): Promise<{
  listed: number;
  downloaded: number;
  skipped: number;
  failed: number;
}> {
  const root = packRoot(opts.root);
  const staging = path.join(root, NARUTO_STAGING_AVALON);
  const cardsDir = path.join(root, "cards");
  mkdirSync(staging, { recursive: true });
  const force = opts.force === true;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;

  console.log(
    "── JA avalon shop → art.avalon (photo boutique, dernier recours)",
  );
  const html = await fetchListing();
  if (!html) {
    console.warn("── JA avalon : listing absente, on s'arrête là");
    return { listed: 0, downloaded: 0, skipped: 0, failed: 0 };
  }
  writeFileSync(path.join(staging, "listing.html"), html, "utf8");

  let rows = avalonInstallRows(parseAvalonNarutoListing(html));
  if (opts.limit && opts.limit > 0) rows = rows.slice(0, opts.limit);
  writeFileSync(
    path.join(staging, "cards.json"),
    `${JSON.stringify(
      {
        source: avalonListingUrl(),
        origin: AVALON_ORIGIN,
        lang: AVALON_LANG,
        capturedAt: new Date().toISOString(),
        ingest: "faces",
        note: "Photos boutique 265×400 — titres JP exploitables, images en dernier recours.",
        cards: rows.map((row) => ({
          ...row,
          product: avalonProductUrl(row.pid),
          image: avalonFullImageUrl(row.pid),
        })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`── JA avalon listing : ${rows.length} singles`);
  if (opts.stagingOnly) {
    return {
      listed: rows.length,
      downloaded: 0,
      skipped: rows.length,
      failed: 0,
    };
  }

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const row of rows) {
    const parsed = parseNarutoCollector(row.printedRef);
    const fallbackFolder = parsed ? narutoCardDiskFolder(parsed) : "ninja";
    const cardDir =
      narutoCardAbsDir(cardsDir, row.diskId, AVALON_LANG) ??
      path.join(cardsDir, fallbackFolder, row.diskId, AVALON_LANG);
    if (!force && existingNarutoArtForSource(cardDir, "avalon")) {
      skip += 1;
      continue;
    }
    if (delayMs > 0) await sleep(delayMs);
    const buf = await downloadPhoto(avalonFullImageUrl(row.pid));
    if (!buf) {
      fail += 1;
      console.log(`JA avalon ${row.diskId} FAIL`);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "avalon",
      lang: AVALON_LANG,
      force,
    });
    if (saved === "skip") skip += 1;
    else ok += 1;
  }

  console.log(
    JSON.stringify({
      avalonShop: true,
      listed: rows.length,
      downloaded: ok,
      skipped: skip,
      failed: fail,
    }),
  );
  return { listed: rows.length, downloaded: ok, skipped: skip, failed: fail };
}
