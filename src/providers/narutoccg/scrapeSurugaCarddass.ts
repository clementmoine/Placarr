/**
 * Install Suruga-ya JP Carddass tabletop scans into `cards/{family}/{ni0001}/ja/`.
 * Cloudflare sits on search HTML; CDN JPEGs do not. Skip Data Carddass.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "./packs";
import { narutoCardAbsDir } from "./narutoCardDisk";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "./narutoFaceBytes";
import {
  foldSurugaCarddassListings,
  loadSurugaCarddassCuratedListings,
  mergeSurugaCarddassListings,
  parseSurugaCarddassSearchHtml,
  SURUGA_CARDDASS_LANG,
  SURUGA_CARDDASS_ORIGIN,
  SURUGA_CARDDASS_SEARCH,
  surugaCarddassFaceUrl,
  type SurugaCarddassCard,
} from "./parseSurugaCarddass";
import { loadSurugaVol1ProbeListings } from "./probeSurugaVol1Listings";

export const NARUTO_STAGING_SURUGA_CARDDASS = path.join(
  "staging",
  "suruga-ya-carddass",
);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 80;
const DEFAULT_CONCURRENCY = 6;
const MIN_BYTES = 4_000;

export type ScrapeSurugaCarddassOptions = {
  force?: boolean;
  limit?: number;
  delayMs?: number;
  concurrency?: number;
  root?: string;
  html?: string;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

async function mapPool<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const n = Math.max(1, concurrency);
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i;
        i += 1;
        await fn(items[idx]!);
      }
    }),
  );
}

async function downloadBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "image/jpeg,image/*,*/*;q=0.8",
        Referer: `${SURUGA_CARDDASS_ORIGIN}/`,
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

export async function scrapeSurugaCarddassCards(
  opts: ScrapeSurugaCarddassOptions = {},
): Promise<{
  listed: number;
  downloaded: number;
  skipped: number;
  failed: number;
}> {
  const root = packRoot(opts.root);
  const staging = path.join(root, NARUTO_STAGING_SURUGA_CARDDASS);
  const cardsDir = path.join(root, "cards");
  mkdirSync(staging, { recursive: true });
  const force = opts.force === true;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;

  console.log("── JA Suruga-ya Carddass → cards/{family}/{id}/ja/");
  const listings = opts.html
    ? parseSurugaCarddassSearchHtml(opts.html)
    : mergeSurugaCarddassListings(
        loadSurugaCarddassCuratedListings(),
        loadSurugaVol1ProbeListings(opts.root),
      );
  let cards = foldSurugaCarddassListings(listings);
  if (opts.limit && opts.limit > 0) cards = cards.slice(0, opts.limit);
  writeFileSync(
    path.join(staging, "cards.json"),
    `${JSON.stringify(
      {
        source: SURUGA_CARDDASS_SEARCH,
        lang: SURUGA_CARDDASS_LANG,
        capturedAt: new Date().toISOString(),
        ingest: "faces",
        cards,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`── JA Suruga listing : ${cards.length} faces`);

  let ok = 0;
  let skip = 0;
  let fail = 0;

  await mapPool(cards, concurrency, async (card: SurugaCarddassCard) => {
    const cardDir =
      narutoCardAbsDir(cardsDir, card.number, SURUGA_CARDDASS_LANG) ??
      path.join(cardsDir, "ninja", card.number, SURUGA_CARDDASS_LANG);
    if (!force && existingNarutoArtForSource(cardDir, "suruga")) {
      skip += 1;
      return;
    }
    let buf: Buffer | null = null;
    for (const productId of card.productIds) {
      if (delayMs > 0) await sleep(delayMs);
      buf = await downloadBytes(surugaCarddassFaceUrl(productId));
      if (buf) break;
    }
    if (!buf) {
      fail += 1;
      console.log(`JA suruga ${card.number} FAIL`);
      return;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "suruga",
      lang: SURUGA_CARDDASS_LANG,
      force,
    });
    if (saved === "skip") skip += 1;
    else ok += 1;
  });

  console.log(
    JSON.stringify({
      surugaCarddass: true,
      listed: cards.length,
      downloaded: ok,
      skipped: skip,
      failed: fail,
    }),
  );
  return { listed: cards.length, downloaded: ok, skipped: skip, failed: fail };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  scrapeSurugaCarddassCards().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
