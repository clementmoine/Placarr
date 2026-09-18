/**
 * Data Carddass host face installers — shared magic/write helpers + Fril,
 * eBay, Chitoroshop, TV Tokyo, Mercari, Suruga, reconstructed.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { cropStudioMatte } from "@/core/enrich/media";
import { httpGet } from "@/lib/http/httpClient";
import { packCardDir, packStagingDir } from "@/lib/packPaths";
import { writeLosslessWebpFile } from "@/lib/media/losslessWebp";
import { dataRoot } from "@/lib/runtimeData";
import { curatedDestStale } from "@/providers/shared/curatedCardsInstall";
import type {
  createLocalPrintsIndex,
  LocalPrintsIndex,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { downloadMercariOrigPhoto } from "@/providers/naruto/shared/mercariCdn";

import { readDataCarddassChecklist } from "../pipeline/ledgers";
import {
  NARUTO_DATA_CARDDASS_PACK_ID,
  narutoDataCarddassCuratedDir,
} from "../pack";
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
} from "../parse/catalogues";
import {
  dataCarddassChitoroshopIngestFaces,
  dataCarddassEbayIngestFaces,
  dataCarddassEbayListingImageFull,
  dataCarddassFrilIngestFaces,
  dataCarddassMercariIngestFaces,
  dataCarddassTvTokyoIngestFaces,
} from "../sources/faces";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const LANG = "ja";

type AssetRow = {
  printKey: string;
  lang: string;
  art: string;
  sourceUrl?: string;
};

type InstallReport = {
  written: string[];
  skipped: string[];
  failed: string[];
};

// ─── shared helpers ────────────────────────────────────────────────────────

function extFromMagic(buf: Buffer, allowGif = false): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return ".jpg";
  }
  if (buf.length >= 8 && buf.subarray(1, 4).toString("ascii") === "PNG") {
    return ".png";
  }
  if (buf.length >= 12 && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return ".webp";
  }
  if (
    allowGif &&
    buf.length >= 6 &&
    buf.subarray(0, 3).toString("ascii") === "GIF"
  ) {
    return ".gif";
  }
  return ".bin";
}

function existingHostArt(cardDir: string, host: string): string | null {
  if (!existsSync(cardDir)) return null;
  const re = new RegExp(`^art\\.${host}\\.`, "i");
  return readdirSync(cardDir).find((name) => re.test(name)) ?? null;
}

function writeHostArt(cardDir: string, host: string, buf: Buffer, allowGif = false): string {
  const ext = extFromMagic(buf, allowGif);
  const destName = `art.${host}${ext === ".bin" ? ".bin" : ext}`;
  const re = new RegExp(`^art\\.${host}\\.`, "i");
  mkdirSync(cardDir, { recursive: true });
  for (const name of readdirSync(cardDir)) {
    if (re.test(name) && name !== destName) {
      unlinkSync(path.join(cardDir, name));
    }
  }
  writeFileSync(path.join(cardDir, destName), buf);
  return destName;
}

async function downloadHostImage(
  url: string,
  opts: {
    referer: string;
    minBytes: number;
    timeout?: number;
    allowGif?: boolean;
  },
): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: opts.referer },
      responseType: "arraybuffer",
      timeout: opts.timeout ?? 40_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf, opts.allowGif) === ".bin") return null;
    return buf.byteLength >= opts.minBytes ? buf : null;
  } catch {
    return null;
  }
}

// ─── Fril ──────────────────────────────────────────────────────────────────

const FRIL_ART_NAME = "art.fril.jpg";

export type InstallDataCarddassFrilFacesOptions = {
  packRoot?: string;
  curatedRoot?: string;
  force?: boolean;
  index?: ReturnType<typeof createLocalPrintsIndex>;
};

export async function installDataCarddassFrilFaces(
  options: InstallDataCarddassFrilFacesOptions = {},
): Promise<InstallReport> {
  const packRoot =
    options.packRoot ?? path.join(dataRoot(), NARUTO_DATA_CARDDASS_PACK_ID);
  const curatedRoot = options.curatedRoot ?? narutoDataCarddassCuratedDir();
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const assets: AssetRow[] = [];

  for (const row of dataCarddassFrilIngestFaces()) {
    const parsed = parseDataCarddassPrinted(row.printedRef);
    if (!parsed) {
      failed.push(row.printedRef);
      continue;
    }
    const printKey = dataCarddassPrintKey(parsed.set, parsed.number);
    if (!printKey) {
      failed.push(row.printedRef);
      continue;
    }
    const cardDir = path.join(
      packRoot,
      "cards",
      parsed.set,
      LANG,
      parsed.number,
    );
    const key = `${parsed.set}/${LANG}/${parsed.number}`;
    if (!options.force) {
      const existing = existingHostArt(cardDir, "fril");
      if (existing) {
        assets.push({
          printKey,
          lang: LANG,
          art: existing,
          sourceUrl: row.listingUrl,
        });
        skipped.push(key);
        continue;
      }
    }

    const src = path.join(curatedRoot, row.curated);
    if (!existsSync(src)) {
      failed.push(key);
      continue;
    }
    mkdirSync(cardDir, { recursive: true });
    for (const name of readdirSync(cardDir)) {
      if (/^art\.fril\./i.test(name) && name !== FRIL_ART_NAME) {
        unlinkSync(path.join(cardDir, name));
      }
    }
    copyFileSync(src, path.join(cardDir, FRIL_ART_NAME));
    assets.push({
      printKey,
      lang: LANG,
      art: FRIL_ART_NAME,
      sourceUrl: row.listingUrl,
    });
    written.push(key);
  }

  if (options.index && assets.length) {
    options.index.writeAssets(assets);
  }
  return { written, skipped, failed };
}

// ─── eBay ──────────────────────────────────────────────────────────────────

export type InstallDataCarddassEbayFacesOptions = {
  packRoot?: string;
  force?: boolean;
  index?: ReturnType<typeof createLocalPrintsIndex>;
};

export async function installDataCarddassEbayFaces(
  options: InstallDataCarddassEbayFacesOptions = {},
): Promise<InstallReport> {
  const packRoot =
    options.packRoot ?? path.join(dataRoot(), NARUTO_DATA_CARDDASS_PACK_ID);
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const assets: AssetRow[] = [];

  for (const row of dataCarddassEbayIngestFaces()) {
    const parsed = parseDataCarddassPrinted(row.printedRef);
    if (!parsed) {
      failed.push(row.printedRef);
      continue;
    }
    const printKey = dataCarddassPrintKey(parsed.set, parsed.number);
    if (!printKey) {
      failed.push(row.printedRef);
      continue;
    }
    const lang = (row.lang || LANG).toLowerCase();
    const cardDir = packCardDir(NARUTO_DATA_CARDDASS_PACK_ID, {
      set: parsed.set,
      lang,
      card: parsed.number,
    });
    const key = `${parsed.set}/${lang}/${parsed.number}`;
    if (!options.force && existingHostArt(cardDir, "ebay")) {
      const art = existingHostArt(cardDir, "ebay")!;
      assets.push({ printKey, lang, art, sourceUrl: row.url });
      skipped.push(key);
      continue;
    }
    const buf = await downloadHostImage(
      dataCarddassEbayListingImageFull(row.url),
      { referer: "https://www.ebay.fr/", minBytes: 8_000, timeout: 30_000 },
    );
    if (!buf) {
      failed.push(key);
      continue;
    }
    if (row.staging) {
      const staging = path.join(packRoot, row.staging);
      mkdirSync(path.dirname(staging), { recursive: true });
      writeFileSync(staging, buf);
    }
    const art = writeHostArt(cardDir, "ebay", buf);
    assets.push({ printKey, lang, art, sourceUrl: row.url });
    written.push(key);
  }

  if (options.index && assets.length) {
    options.index.writeAssets(assets);
  }
  return { written, skipped, failed };
}

// ─── Chitoroshop ───────────────────────────────────────────────────────────

export type InstallDataCarddassChitoroshopFacesOptions = {
  packRoot?: string;
  force?: boolean;
  index?: ReturnType<typeof createLocalPrintsIndex>;
};

export async function installDataCarddassChitoroshopFaces(
  options: InstallDataCarddassChitoroshopFacesOptions = {},
): Promise<InstallReport> {
  const packRoot =
    options.packRoot ?? path.join(dataRoot(), NARUTO_DATA_CARDDASS_PACK_ID);
  const staging = path.join(
    packStagingDir(NARUTO_DATA_CARDDASS_PACK_ID),
    "chitoroshop",
  );
  mkdirSync(staging, { recursive: true });

  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const assets: AssetRow[] = [];

  for (const row of dataCarddassChitoroshopIngestFaces()) {
    const parsed = parseDataCarddassPrinted(row.printed);
    if (!parsed) {
      failed.push(row.printed);
      continue;
    }
    const printKey = dataCarddassPrintKey(parsed.set, parsed.number);
    if (!printKey) {
      failed.push(row.printed);
      continue;
    }
    const cardDir = packCardDir(NARUTO_DATA_CARDDASS_PACK_ID, {
      set: parsed.set,
      lang: LANG,
      card: parsed.number,
    });
    const key = `${parsed.set}/${LANG}/${parsed.number}`;
    if (!options.force && existingHostArt(cardDir, "chitoroshop")) {
      const art = existingHostArt(cardDir, "chitoroshop")!;
      assets.push({ printKey, lang: LANG, art, sourceUrl: row.url });
      skipped.push(key);
      continue;
    }
    const buf = await downloadHostImage(row.url, {
      referer: "https://chitoroshop.com/",
      minBytes: 8_000,
    });
    if (!buf) {
      failed.push(key);
      continue;
    }
    const stagingName = `${parsed.set}-${parsed.number}${extFromMagic(buf)}`;
    writeFileSync(path.join(staging, stagingName), buf);
    const art = writeHostArt(cardDir, "chitoroshop", buf);
    assets.push({ printKey, lang: LANG, art, sourceUrl: row.url });
    written.push(key);
  }

  writeFileSync(
    path.join(staging, "faces.json"),
    `${JSON.stringify(
      {
        source: "chitoroshop",
        packRoot,
        written,
        skipped,
        failed,
      },
      null,
      2,
    )}\n`,
  );

  if (options.index && assets.length) {
    options.index.writeAssets(assets);
  }
  return { written, skipped, failed };
}

// ─── TV Tokyo ──────────────────────────────────────────────────────────────

export type InstallDataCarddassTvTokyoFacesOptions = {
  packRoot?: string;
  force?: boolean;
  index?: ReturnType<typeof createLocalPrintsIndex>;
};

export async function installDataCarddassTvTokyoFaces(
  options: InstallDataCarddassTvTokyoFacesOptions = {},
): Promise<InstallReport> {
  const staging = path.join(
    packStagingDir(NARUTO_DATA_CARDDASS_PACK_ID),
    "tvtokyo",
  );
  mkdirSync(staging, { recursive: true });

  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const assets: AssetRow[] = [];

  for (const row of dataCarddassTvTokyoIngestFaces()) {
    const parsed = parseDataCarddassPrinted(row.printed);
    if (!parsed) {
      failed.push(row.printed);
      continue;
    }
    const printKey = dataCarddassPrintKey(parsed.set, parsed.number);
    if (!printKey) {
      failed.push(row.printed);
      continue;
    }
    const cardDir = packCardDir(NARUTO_DATA_CARDDASS_PACK_ID, {
      set: parsed.set,
      lang: LANG,
      card: parsed.number,
    });
    const key = `${parsed.set}/${LANG}/${parsed.number}`;
    if (!options.force && existingHostArt(cardDir, "tvtokyo")) {
      const art = existingHostArt(cardDir, "tvtokyo")!;
      assets.push({ printKey, lang: LANG, art, sourceUrl: row.url });
      skipped.push(key);
      continue;
    }
    const buf = await downloadHostImage(row.url, {
      referer: "https://www.tv-tokyo.co.jp/anime/naruto2002/goods/",
      minBytes: 2_000,
      allowGif: true,
    });
    if (!buf) {
      failed.push(key);
      continue;
    }
    const stagingName = `${parsed.set}-${parsed.number}${extFromMagic(buf, true)}`;
    writeFileSync(path.join(staging, stagingName), buf);
    const art = writeHostArt(cardDir, "tvtokyo", buf, true);
    assets.push({ printKey, lang: LANG, art, sourceUrl: row.url });
    written.push(key);
  }

  if (options.index && assets.length) {
    options.index.writeAssets(assets);
  }

  return { written, skipped, failed };
}

// ─── Mercari ───────────────────────────────────────────────────────────────

export type InstallDataCarddassMercariFacesOptions = {
  packRoot?: string;
  curatedRoot?: string;
  force?: boolean;
  index?: ReturnType<typeof createLocalPrintsIndex>;
  /** Crop light studio matte (Mercari square pads). Default on. */
  cropMatte?: boolean;
  fetchImage?: (url: string) => Promise<Buffer | null>;
};

export async function installDataCarddassMercariFaces(
  options: InstallDataCarddassMercariFacesOptions = {},
): Promise<InstallReport> {
  const packRoot =
    options.packRoot ?? path.join(dataRoot(), NARUTO_DATA_CARDDASS_PACK_ID);
  const curatedRoot = options.curatedRoot ?? narutoDataCarddassCuratedDir();
  const fetchImage = options.fetchImage ?? downloadMercariOrigPhoto;
  const staging = path.join(
    packStagingDir(NARUTO_DATA_CARDDASS_PACK_ID),
    "mercari",
  );
  mkdirSync(staging, { recursive: true });

  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const assets: AssetRow[] = [];
  const cropMatte = options.cropMatte !== false;

  for (const row of dataCarddassMercariIngestFaces()) {
    const parsed = parseDataCarddassPrinted(row.printedRef);
    if (!parsed) {
      failed.push(row.printedRef);
      continue;
    }
    const printKey = dataCarddassPrintKey(parsed.set, parsed.number);
    if (!printKey) {
      failed.push(row.printedRef);
      continue;
    }
    const cardDir = packCardDir(NARUTO_DATA_CARDDASS_PACK_ID, {
      set: parsed.set,
      lang: LANG,
      card: parsed.number,
    });
    const key = `${parsed.set}/${LANG}/${parsed.number}`;
    if (!options.force && existingHostArt(cardDir, "mercari")) {
      const art = existingHostArt(cardDir, "mercari")!;
      assets.push({
        printKey,
        lang: LANG,
        art,
        sourceUrl: row.listingUrl,
      });
      skipped.push(key);
      continue;
    }

    let buf: Buffer | null = null;
    const curatedRel =
      "curated" in row && typeof row.curated === "string" ? row.curated : null;
    if (curatedRel) {
      const src = path.join(curatedRoot, curatedRel);
      if (existsSync(src)) buf = readFileSync(src);
    }
    if (!buf && typeof row.url === "string" && row.url.length > 0) {
      buf = await fetchImage(row.url);
    }
    if (!buf) {
      failed.push(key);
      continue;
    }
    if (cropMatte) {
      buf = await cropStudioMatte(buf);
    }
    const stageName = `${parsed.set}-${parsed.number}${extFromMagic(buf)}`;
    writeFileSync(path.join(staging, stageName), buf);
    const art = writeHostArt(cardDir, "mercari", buf);
    assets.push({
      printKey,
      lang: LANG,
      art,
      sourceUrl: row.listingUrl,
    });
    written.push(key);
  }

  if (options.index && assets.length) {
    options.index.writeAssets(assets);
  }
  return { written, skipped, failed };
}

// ─── Suruga ────────────────────────────────────────────────────────────────

const SURUGA_MIN_BYTES = 4_000;
const SURUGA_DEFAULT_DELAY_MS = 80;
const SURUGA_DEFAULT_CONCURRENCY = 6;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

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
        .prepare(`SELECT card_type AS cardType, number FROM prints`)
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
  const assets: AssetRow[] = [];
  const delayMs = options.delayMs ?? SURUGA_DEFAULT_DELAY_MS;
  const concurrency = options.concurrency ?? SURUGA_DEFAULT_CONCURRENCY;
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
    if (!force && existingHostArt(cardDir, "suruga")) {
      const art = existingHostArt(cardDir, "suruga")!;
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
      buf = await downloadHostImage(surugaDataCarddassFaceUrl(productId), {
        referer: `${SURUGA_DCD_ORIGIN}/`,
        minBytes: SURUGA_MIN_BYTES,
        timeout: 30_000,
      });
      if (buf) break;
    }
    if (!buf) {
      failed.push(key);
      return;
    }
    writeFileSync(
      path.join(staging, `${resolved.set}-${resolved.number}.jpg`),
      buf,
    );
    const art = writeHostArt(cardDir, "suruga", buf);
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

// ─── Reconstructed ─────────────────────────────────────────────────────────

const RECONSTRUCTED_LEDGER_FILE = "reconstructed-faces.json";
const RECONSTRUCTED_ART_BASENAME = "art.reconstructed";

export type DataCarddassReconstructedFaceLedgerRow = {
  setCode: string;
  number: string;
  printed?: string;
  lang?: string;
  sourceFile: string;
  note?: string;
};

export type DataCarddassReconstructedFacesLedger = {
  sourceId: string;
  lang?: string;
  faces: DataCarddassReconstructedFaceLedgerRow[];
};

export function readDataCarddassReconstructedFacesLedger(
  curatedRoot = narutoDataCarddassCuratedDir(),
): DataCarddassReconstructedFacesLedger {
  const file = path.join(curatedRoot, "sources", RECONSTRUCTED_LEDGER_FILE);
  if (!existsSync(file)) {
    return { sourceId: "reconstructed", lang: "ja", faces: [] };
  }
  try {
    return JSON.parse(
      readFileSync(file, "utf8"),
    ) as DataCarddassReconstructedFacesLedger;
  } catch {
    return { sourceId: "reconstructed", lang: "ja", faces: [] };
  }
}

export type DiscoveredCuratedFace = {
  setCode: string;
  lang: string;
  number: string;
  artSource: string;
  printed?: string;
};

function pickFaceFile(cardDir: string): string | null {
  const files = readdirSync(cardDir);
  const recon = files.find((f) =>
    /^art\.reconstructed\.(png|webp|jpe?g)$/i.test(f),
  );
  if (recon) return path.join(cardDir, recon);
  const src = files.find((f) => /^source\.(png|webp|jpe?g)$/i.test(f));
  if (src) return path.join(cardDir, src);
  return null;
}

export function listCuratedDataCarddassFaces(
  curatedRoot = narutoDataCarddassCuratedDir(),
): DiscoveredCuratedFace[] {
  const cardsRoot = path.join(curatedRoot, "cards");
  if (!existsSync(cardsRoot)) return [];
  const out: DiscoveredCuratedFace[] = [];

  for (const set of readdirSync(cardsRoot)) {
    const setCode = set.toLowerCase();
    if (!isDataCarddassSetCode(setCode)) continue;
    const setDir = path.join(cardsRoot, set);
    if (!statSync(setDir).isDirectory()) continue;

    for (const langOrNum of readdirSync(setDir)) {
      const segDir = path.join(setDir, langOrNum);
      if (!statSync(segDir).isDirectory()) continue;

      if (/^[a-z]{2}$/i.test(langOrNum)) {
        const lang = langOrNum.toLowerCase();
        for (const num of readdirSync(segDir)) {
          const cardDir = path.join(segDir, num);
          if (!statSync(cardDir).isDirectory()) continue;
          const art = pickFaceFile(cardDir);
          if (art) {
            out.push({
              setCode,
              lang,
              number: num.toLowerCase(),
              artSource: art,
            });
          }
        }
      } else {
        const art = pickFaceFile(segDir);
        if (art) {
          out.push({
            setCode,
            lang: "ja",
            number: langOrNum.toLowerCase(),
            artSource: art,
          });
        }
      }
    }
  }
  return out;
}

async function writeFaceWebp(
  src: string,
  dest: string,
  force?: boolean,
): Promise<boolean> {
  if (!force && !curatedDestStale(src, dest)) return false;
  mkdirSync(path.dirname(dest), { recursive: true });
  if (/\.webp$/i.test(src)) {
    copyFileSync(src, dest);
    return true;
  }
  await writeLosslessWebpFile(src, dest);
  return true;
}

export async function installDataCarddassReconstructedFaces(
  options: {
    force?: boolean;
    index?: LocalPrintsIndex;
    curatedRoot?: string;
  } = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const curatedRoot = options.curatedRoot ?? narutoDataCarddassCuratedDir();
  const ledger = readDataCarddassReconstructedFacesLedger(curatedRoot);
  const discovered = listCuratedDataCarddassFaces(curatedRoot);

  const byKey = new Map<string, DiscoveredCuratedFace>();
  for (const item of discovered) {
    byKey.set(`${item.setCode}:${item.lang}:${item.number}`, item);
  }

  for (const row of ledger.faces) {
    const setCode = row.setCode.trim().toLowerCase();
    const number = row.number.trim().toLowerCase();
    const lang = (row.lang ?? ledger.lang ?? "ja").trim().toLowerCase();
    const key = `${setCode}:${lang}:${number}`;
    const src = path.join(curatedRoot, row.sourceFile);
    if (existsSync(src)) {
      byKey.set(key, {
        setCode,
        lang,
        number,
        artSource: src,
        printed: row.printed,
      });
    }
  }

  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art?: string;
    sourceUrl?: string | null;
  }[] = [];

  for (const card of byKey.values()) {
    const printKey = dataCarddassPrintKey(card.setCode, card.number);
    if (!printKey) {
      failed.push(card.printed ?? `${card.setCode}-${card.number}`);
      continue;
    }
    const cardDir = packCardDir(NARUTO_DATA_CARDDASS_PACK_ID, {
      set: card.setCode,
      lang: card.lang,
      card: card.number,
    });
    const key = `${card.setCode}/${card.lang}/${card.number}`;
    const destArt = path.join(cardDir, `${RECONSTRUCTED_ART_BASENAME}.webp`);

    try {
      const changed = await writeFaceWebp(
        card.artSource,
        destArt,
        options.force,
      );
      if (changed) {
        written.push(key);
      } else {
        skipped.push(key);
      }
      assets.push({
        printKey,
        lang: card.lang,
        art: `${RECONSTRUCTED_ART_BASENAME}.webp`,
      });
    } catch {
      failed.push(key);
    }
  }

  if (options.index && assets.length) {
    options.index.writeAssets(assets);
  }

  return { written, skipped, failed };
}
