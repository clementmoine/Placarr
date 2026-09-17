/**
 * Install Suruga-ya Data Carddass scans as `art.suruga.*`.
 * CDN JPEGs (no Cloudflare) — same host pattern as Carddass tabletop.
 * Disk: `cards/{set}/ja/{number}/`.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packCardDir, packStagingDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";
import type { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { readDataCarddassChecklist } from "../buildFromLedgers";
import { NARUTO_DATA_CARDDASS_PACK_ID } from "../pack";
import {
  dataCarddassPrintKey,
  isDataCarddassSetCode,
  parseDataCarddassPrinted,
  resolveDataCarddassSurugaListing,
} from "../printKey";
import {
  foldSurugaDataCarddassListings,
  loadSurugaDataCarddassCuratedListings,
  SURUGA_DCD_CATEGORY,
  SURUGA_DCD_LANG,
  SURUGA_DCD_ORIGIN,
  surugaDataCarddassFaceUrl,
  type SurugaDataCarddassCard,
} from "../parse/parseSurugaDataCarddass";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const MIN_BYTES = 4_000;
const DEFAULT_DELAY_MS = 80;
const DEFAULT_CONCURRENCY = 6;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function extFromMagic(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return ".jpg";
  }
  if (buf.length >= 8 && buf.subarray(1, 4).toString("ascii") === "PNG") {
    return ".png";
  }
  if (buf.length >= 12 && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return ".webp";
  }
  return ".bin";
}

function existingSurugaArt(cardDir: string): string | null {
  if (!existsSync(cardDir)) return null;
  return readdirSync(cardDir).find((name) => /^art\.suruga\./i.test(name)) ?? null;
}

function writeSurugaArt(cardDir: string, buf: Buffer): string {
  const ext = extFromMagic(buf);
  const destName = `art.suruga${ext === ".bin" ? ".bin" : ext}`;
  mkdirSync(cardDir, { recursive: true });
  for (const name of readdirSync(cardDir)) {
    if (/^art\.suruga\./i.test(name) && name !== destName) {
      unlinkSync(path.join(cardDir, name));
    }
  }
  writeFileSync(path.join(cardDir, destName), buf);
  return destName;
}

async function downloadBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "image/jpeg,image/*,*/*;q=0.8",
        Referer: `${SURUGA_DCD_ORIGIN}/`,
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

export type InstallDataCarddassSurugaFacesOptions = {
  packRoot?: string;
  force?: boolean;
  limit?: number;
  delayMs?: number;
  concurrency?: number;
  index?: ReturnType<typeof createLocalPrintsIndex>;
};

export async function installDataCarddassSurugaFaces(
  options: InstallDataCarddassSurugaFacesOptions = {},
): Promise<{
  listed: number;
  written: string[];
  skipped: string[];
  failed: string[];
}> {
  const packRoot =
    options.packRoot ?? path.join(dataRoot(), NARUTO_DATA_CARDDASS_PACK_ID);
  const staging = path.join(
    packStagingDir(NARUTO_DATA_CARDDASS_PACK_ID),
    "suruga-ya-data-carddass",
  );
  mkdirSync(staging, { recursive: true });

  let cards = foldSurugaDataCarddassListings(
    loadSurugaDataCarddassCuratedListings(),
  );
  if (options.limit && options.limit > 0) cards = cards.slice(0, options.limit);

  /** Checklist set:number — Suruga bare refs (`DN-080`) resolve to lettered (`080t`). */
  const knownSetNumbers = new Set<string>();
  const setsWithChecklistRows = new Set<string>();
  for (const card of readDataCarddassChecklist().cards) {
    const parsed =
      parseDataCarddassPrinted(card.printed) ??
      (card.set && card.number && isDataCarddassSetCode(card.set)
        ? {
            set: card.set.trim().toLowerCase(),
            number: card.number.trim().toLowerCase(),
          }
        : null);
    if (!parsed || !isDataCarddassSetCode(parsed.set)) continue;
    knownSetNumbers.add(`${parsed.set}:${parsed.number}`);
    setsWithChecklistRows.add(parsed.set);
  }
  /*
    Promo lines like CAN may already have prints (Suruga titles) but zero
    checklist rows. `searchRows("")` is intentionally empty — seed from the
    prints table so `CAN-001` on disk can attach to `datacarddass:can-001`.
  */
  if (options.index) {
    const db = options.index.ensure();
    if (db) {
      const rows = db
        .prepare(
          `SELECT card_type AS cardType, number FROM prints`,
        )
        .all() as Array<{ cardType: string; number: string }>;
      for (const row of rows) {
        const set = row.cardType?.trim().toLowerCase();
        const number = row.number?.trim().toLowerCase();
        if (!set || !number || !isDataCarddassSetCode(set)) continue;
        knownSetNumbers.add(`${set}:${number}`);
      }
    }
  }

  writeFileSync(
    path.join(staging, "cards.json"),
    `${JSON.stringify(
      {
        source: SURUGA_DCD_CATEGORY,
        lang: SURUGA_DCD_LANG,
        capturedAt: new Date().toISOString(),
        ingest: "faces",
        cards,
      },
      null,
      2,
    )}\n`,
  );

  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const assets: Array<{
    printKey: string;
    lang: string;
    art: string;
    sourceUrl?: string;
  }> = [];
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const force = options.force === true;

  await mapPool(cards, concurrency, async (card: SurugaDataCarddassCard) => {
    const resolved = resolveDataCarddassSurugaListing(
      card.set,
      card.number,
      knownSetNumbers,
      setsWithChecklistRows,
    );
    if (!resolved) {
      failed.push(card.printed);
      return;
    }
    const printKey = dataCarddassPrintKey(resolved.set, resolved.number);
    if (!printKey) {
      failed.push(card.printed);
      return;
    }
    const cardDir = packCardDir(NARUTO_DATA_CARDDASS_PACK_ID, {
      set: resolved.set,
      lang: SURUGA_DCD_LANG,
      card: resolved.number,
    });
    const key = `${resolved.set}/${SURUGA_DCD_LANG}/${resolved.number}`;
    if (!force && existingSurugaArt(cardDir)) {
      const art = existingSurugaArt(cardDir)!;
      assets.push({
        printKey,
        lang: SURUGA_DCD_LANG,
        art,
        sourceUrl: card.faceUrl,
      });
      skipped.push(key);
      return;
    }
    let buf: Buffer | null = null;
    for (const productId of card.productIds) {
      if (delayMs > 0) await sleep(delayMs);
      buf = await downloadBytes(surugaDataCarddassFaceUrl(productId));
      if (buf) break;
    }
    if (!buf) {
      failed.push(key);
      return;
    }
    const stagingFace = path.join(
      staging,
      `${resolved.set}-${resolved.number}.jpg`,
    );
    writeFileSync(stagingFace, buf);
    const art = writeSurugaArt(cardDir, buf);
    assets.push({
      printKey,
      lang: SURUGA_DCD_LANG,
      art,
      sourceUrl: card.faceUrl,
    });
    written.push(key);
  });

  if (options.index && assets.length) {
    options.index.writeAssets(assets);
  }

  return { listed: cards.length, written, skipped, failed };
}
