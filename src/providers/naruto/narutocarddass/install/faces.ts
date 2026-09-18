/**
 * Naruto Carddass face installers — marketplaces, official scans, staging.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import sharp from "sharp";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";
import { downloadMercariOrigPhoto } from "@/providers/naruto/shared/mercariCdn";

import { parseNarutoCollector, narutoDiskCardId } from "../identity";
import carddasDoubleIllustrations from "../curated/sources/carddas-jp-double-illustrations.json";
import goatLocalePromoLedger from "../curated/sources/goat-locale-promos.json";
import leboncoinLedger from "../curated/sources/leboncoin.json";
import driveLedger from "../curated/sources/naruto-ccg-drive.json";
import { narutoCuratedDir } from "../identity";
import type { NarutoFaceSource } from "../disk";
import { upsertNarutoAppearances } from "../pipeline";
import { narutoCardAbsDir } from "../disk";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "../disk";
import { NARUTO_PACK_ID } from "../identity";
import { carddasJpStagingFaceInstallTarget } from "../parse/bandai";
import {
  driveEnhancedFolders,
  driveFaceAppearanceSet,
  driveFaceDiskId,
  driveOfficialSetCodeInPath,
  drivePathIsFanset,
  driveStagingSegment,
  parseDriveNarutoFaceFilename,
  pickDriveFaceWinner,
  type DriveFaceTag,
} from "../parse/catalogues";
import { NARUTO_STAGING_CARDDAS_JP } from "../scrape/bandai";
import {
  colekaCarddassFrBranchCoverUrl,
  colekaEnCcgNewDisplays,
  colekaThumbToFull,
  ebayIngestFaces,
  ebayListingImageFull,
  rakutenIngestFaces,
} from "../sources/packshots";
import {
  mercariIngestFaces,
  narutoCcgTvTokyoIngestFaces,
  slabzFaceUrl,
  slabzIngestFaces,
  tvTokyoFaceSourceFromFile,
  yahooIngestFaces,
  type NarutoCcgTvTokyoFace,
} from "../sources/faces";

/** Local copy — importing from harvest/catalogues creates install ↔ scrape cycles. */
const NARUTO_STAGING_DRIVE = path.join("staging", "naruto-ccg-drive");

// ─── shared helpers ────────────────────────────────────────────────────────

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function packRootOf(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

function diskIdOf(row: {
  diskId?: string | null;
  printedRef?: string | null;
}): string | null {
  const fromDisk = String(row.diskId ?? "").trim().toLowerCase();
  if (fromDisk) return fromDisk;
  const printed = String(row.printedRef ?? "").trim();
  return printed ? narutoDiskCardId(printed) : null;
}

async function downloadFaceImage(
  url: string,
  opts: {
    referer: string;
    minBytes?: number;
    requireMagic?: boolean;
  },
): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: opts.referer },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (opts.requireMagic !== false && extFromMagic(buf) === ".bin") return null;
    const min = opts.minBytes ?? 8_000;
    return buf.byteLength >= min ? buf : null;
  } catch {
    return null;
  }
}

function walkImageFiles(dir: string, re: RegExp): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walkImageFiles(abs, re));
    else if (re.test(name)) out.push(abs);
  }
  return out;
}


// ─── eBay faces ──────────────────────────────────────────────────


export type InstallEbayFacesOptions = {
  packRoot?: string;
  force?: boolean;
};
export async function installEbayFaces(
  options: InstallEbayFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const cardsDir = path.join(packRoot, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const row of ebayIngestFaces()) {
    const diskId = narutoDiskCardId(row.printedRef);
    if (!diskId) {
      failed.push(row.printedRef);
      continue;
    }
    const lang = row.lang.toLowerCase();
    // Catalogue = JA + FR + EN. Les scans IT restent au ledger, pas sur disque.
    if (lang === "it") {
      skipped.push(`${diskId}/it`);
      continue;
    }
    const cardDir =
      narutoCardAbsDir(cardsDir, diskId, lang, row.setCode) ??
      path.join(cardsDir, "ninja", diskId, lang);
    const key = `${diskId}/${lang}`;
    // An appearance is a card *in a set*. The 騎 knights have no attested set
    // outside 巻ノ十三, so they record none rather than an invented one.
    if (row.setCode) {
      upsertNarutoAppearances(packRoot, [
        { diskId, lang, appearanceSet: row.setCode },
      ]);
    }
    if (!options.force && existingNarutoArtForSource(cardDir, "ebay")) {
      skipped.push(key);
      continue;
    }
    const buf = await downloadFaceImage(ebayListingImageFull(row.url), {
      referer: "https://www.ebay.fr/",
    });
    if (!buf) {
      failed.push(key);
      continue;
    }
    if (row.staging) {
      const staging = path.join(packRoot, row.staging);
      mkdirSync(path.dirname(staging), { recursive: true });
      writeFileSync(staging, buf);
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "ebay",
      lang,
      force: options.force,
    });
    if (saved === "skip") skipped.push(key);
    else written.push(key);
  }
  return { written, skipped, failed };
}

// ─── Rakuten faces ───────────────────────────────────────────────


export type InstallRakutenFacesOptions = {
  packRoot?: string;
  force?: boolean;
};

export async function installRakutenFaces(
  options: InstallRakutenFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const cardsDir = path.join(packRoot, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const row of rakutenIngestFaces()) {
    const diskId = diskIdOf(row);
    if (!diskId) {
      failed.push(String(row.printedRef ?? row.url));
      continue;
    }
    const lang = String(row.lang ?? "fr").toLowerCase();
    const cardDir =
      narutoCardAbsDir(cardsDir, diskId, lang) ??
      path.join(cardsDir, "ninja", diskId, lang);
    const key = `${diskId}/${lang}`;
    if (!options.force && existingNarutoArtForSource(cardDir, "rakuten")) {
      skipped.push(key);
      continue;
    }
    const buf = await downloadFaceImage(row.url, {
      referer: "https://fr.shopping.rakuten.com/",
      minBytes: 4_000,
    });
    if (!buf) {
      failed.push(key);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "rakuten",
      lang,
      force: options.force,
    });
    if (saved === "skip") skipped.push(key);
    else written.push(key);
  }
  return { written, skipped, failed };
}

// ─── Leboncoin faces ─────────────────────────────────────────────


export type LeboncoinFace = (typeof leboncoinLedger.faces)[number];
export function leboncoinFaceLedger() {
  return leboncoinLedger;
}
export function leboncoinIngestFaces(): LeboncoinFace[] {
  return leboncoinLedger.faces.filter((row) => row.ingest);
}
/** Prefer `ad-large` (602×800). Bare hash URLs 404. */
export function leboncoinListingImageFull(url: string): string {
  if (/[?&]rule=/.test(url)) {
    return url.replace(/([?&]rule=)[^&]+/, "$1ad-large");
  }
  return `${url}${url.includes("?") ? "&" : "?"}rule=ad-large`;
}
export type InstallLeboncoinFacesOptions = {
  packRoot?: string;
  force?: boolean;
};
export async function installLeboncoinFaces(
  options: InstallLeboncoinFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const cardsDir = path.join(packRoot, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const row of leboncoinIngestFaces()) {
    const diskId = narutoDiskCardId(row.printedRef);
    if (!diskId) {
      failed.push(row.printedRef);
      continue;
    }
    const lang = row.lang.toLowerCase();
    const cardDir =
      narutoCardAbsDir(cardsDir, diskId, lang, row.setCode) ??
      path.join(cardsDir, "ninja", diskId, lang);
    const key = `${diskId}/${lang}`;
    if (row.setCode) {
      upsertNarutoAppearances(packRoot, [
        { diskId, lang, appearanceSet: row.setCode },
      ]);
    }
    if (!options.force && existingNarutoArtForSource(cardDir, "leboncoin")) {
      skipped.push(key);
      continue;
    }
    const buf = await downloadFaceImage(leboncoinListingImageFull(row.url), {
      referer: "https://www.leboncoin.fr/",
    });
    if (!buf) {
      failed.push(key);
      continue;
    }
    if (row.staging) {
      const staging = path.join(packRoot, row.staging);
      mkdirSync(path.dirname(staging), { recursive: true });
      writeFileSync(staging, buf);
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "leboncoin",
      lang,
      force: options.force,
    });
    if (saved === "skip") skipped.push(key);
    else written.push(key);
  }
  return { written, skipped, failed };
}

// ─── Mercari faces ───────────────────────────────────────────────

export type InstallMercariFacesOptions = {
  packRoot?: string;
  curatedRoot?: string;
  force?: boolean;
  dryRun?: boolean;
  /** Test seam — defaults to live mercdn fetch. */
  fetchImage?: (url: string) => Promise<Buffer | null>;
};

export async function installMercariFaces(
  options: InstallMercariFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const curatedRoot = options.curatedRoot ?? narutoCuratedDir();
  const fetchImage = options.fetchImage ?? downloadMercariOrigPhoto;
  const cardsDir = path.join(packRoot, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const row of mercariIngestFaces()) {
    const diskId = narutoDiskCardId(row.printedRef);
    if (!diskId) {
      failed.push(row.printedRef);
      continue;
    }
    const lang = row.lang.toLowerCase();
    const cardDir =
      narutoCardAbsDir(cardsDir, diskId, lang, row.setCode) ??
      path.join(cardsDir, "ninja", diskId, lang);
    const key = `${diskId}/${lang}`;
    upsertNarutoAppearances(packRoot, [
      { diskId, lang, appearanceSet: row.setCode },
    ]);
    if (!options.force && existingNarutoArtForSource(cardDir, "mercari")) {
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
    if (options.dryRun) {
      written.push(key);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "mercari",
      lang,
      force: options.force,
    });
    if (saved === "skip") skipped.push(key);
    else written.push(key);
  }
  return { written, skipped, failed };
}

// ─── Yahoo Auction faces ─────────────────────────────────────────

export type InstallYahooAuctionFacesOptions = {
  packRoot?: string;
  curatedRoot?: string;
  force?: boolean;
  dryRun?: boolean;
};

export async function installYahooAuctionFaces(
  options: InstallYahooAuctionFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const curatedRoot = options.curatedRoot ?? narutoCuratedDir();
  const cardsDir = path.join(packRoot, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const row of yahooIngestFaces()) {
    const diskId = narutoDiskCardId(row.printedRef);
    if (!diskId) {
      failed.push(row.printedRef);
      continue;
    }
    const lang = row.lang.toLowerCase();
    const cardDir =
      narutoCardAbsDir(cardsDir, diskId, lang, row.setCode) ??
      path.join(cardsDir, "ninja", diskId, lang);
    const key = `${diskId}/${lang}`;
    upsertNarutoAppearances(packRoot, [
      { diskId, lang, appearanceSet: row.setCode },
    ]);
    if (!options.force && existingNarutoArtForSource(cardDir, "yahoo")) {
      skipped.push(key);
      continue;
    }
    const src = path.join(curatedRoot, row.curated);
    if (!existsSync(src)) {
      failed.push(key);
      continue;
    }
    if (options.dryRun) {
      written.push(key);
      continue;
    }
    const buf = readFileSync(src);
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "yahoo",
      lang,
      force: options.force,
    });
    if (saved === "skip") skipped.push(key);
    else written.push(key);
  }
  return { written, skipped, failed };
}

// ─── Slabz faces ─────────────────────────────────────────────────


export type InstallSlabzFacesOptions = {
  packRoot?: string;
  force?: boolean;
};
export async function installSlabzFaces(
  options: InstallSlabzFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const cardsDir = path.join(packRoot, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const row of slabzIngestFaces()) {
    const diskId = row.disk.trim().toLowerCase();
    const lang = "ja";
    const cardDir =
      narutoCardAbsDir(cardsDir, diskId, lang) ??
      path.join(cardsDir, "ninja", diskId, lang);
    const key = `${diskId}/${lang}`;
    if (!options.force && existingNarutoArtForSource(cardDir, "slabz")) {
      skipped.push(key);
      continue;
    }
    const buf = await downloadFaceImage(slabzFaceUrl(row.media), {
      referer:
        "https://www.slab-z.com/post/the-definitive-2002-naruto-card-game-vintage-guide-rookies-grails",
    });
    if (!buf) {
      failed.push(key);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "slabz",
      lang,
      force: options.force,
    });
    if (saved === "skip") skipped.push(key);
    else written.push(key);
  }
  return { written, skipped, failed };
}

// ─── TV Tokyo faces ──────────────────────────────────────────────


export type InstallTvTokyoFacesOptions = {
  packRoot?: string;
  force?: boolean;
  fetchImage?: (url: string) => Promise<Buffer | null>;
};

type PlannedFace = {
  row: NarutoCcgTvTokyoFace;
  diskId: string;
  lang: string;
  source: NarutoFaceSource;
};
/** Assign sources before any download — a/b + collisions plain/plain. */
export function planTvTokyoFaceSources(
  faces: readonly NarutoCcgTvTokyoFace[] = narutoCcgTvTokyoIngestFaces(),
): { planned: PlannedFace[]; failed: string[] } {
  const planned: PlannedFace[] = [];
  const failed: string[] = [];
  const claimed = new Map<string, Set<NarutoFaceSource>>();
  for (const row of faces) {
    const diskId = diskIdOf(row);
    if (!diskId) {
      failed.push(String(row.printedRef ?? row.url));
      continue;
    }
    const lang = String(row.lang ?? "ja").toLowerCase();
    let source: NarutoFaceSource = tvTokyoFaceSourceFromFile(
      String(row.file ?? ""),
    );
    const used = claimed.get(diskId) ?? new Set<NarutoFaceSource>();
    if (used.has(source)) {
      if (source === "tvtokyo" && !used.has("tvtokyo-b")) {
        source = "tvtokyo-b";
      } else {
        failed.push(`${diskId}/${lang}:${row.file}:source-collision`);
        continue;
      }
    }
    used.add(source);
    claimed.set(diskId, used);
    planned.push({ row, diskId, lang, source });
  }
  return { planned, failed };
}
export async function installTvTokyoFaces(
  options: InstallTvTokyoFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const cardsDir = path.join(packRoot, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const { planned, failed: planFailed } = planTvTokyoFaceSources();
  const failed: string[] = [...planFailed];
  const CHUNK_SIZE = 8;
  for (let i = 0; i < planned.length; i += CHUNK_SIZE) {
    const chunk = planned.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async ({ row, diskId, lang, source }) => {
        const cardDir = narutoCardAbsDir(cardsDir, diskId, lang);
        if (!cardDir) {
          failed.push(`${diskId}/${lang}`);
          return;
        }
        const key = `${diskId}/${lang}/${source}`;
        if (!options.force && existingNarutoArtForSource(cardDir, source)) {
          skipped.push(key);
          return;
        }
        const buf = options.fetchImage
          ? await options.fetchImage(row.url)
          : await downloadFaceImage(row.url, {
              referer: "https://www.tv-tokyo.co.jp/anime/naruto2002/goods/",
              minBytes: 800,
              requireMagic: false,
            });
        if (!buf) {
          failed.push(key);
          return;
        }
        const saved = await saveNarutoFace({
          cardDir,
          buf,
          source,
          lang,
          force: options.force,
        });
        if (saved === "skip") skipped.push(key);
        else written.push(key);
      }),
    );
  }
  return { written, skipped, failed };
}

// ─── Goat locale promo faces ─────────────────────────────────────


export type GoatLocalePromoFace = (typeof goatLocalePromoLedger.faces)[number];
export function goatLocalePromoFaceLedger() {
  return goatLocalePromoLedger;
}
export function goatLocalePromoIngestFaces(): GoatLocalePromoFace[] {
  return goatLocalePromoLedger.faces.filter((row) => row.ingest);
}
export type InstallGoatLocalePromoFacesOptions = {
  packRoot?: string;
  force?: boolean;
};
export async function installGoatLocalePromoFaces(
  options: InstallGoatLocalePromoFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const cardsDir = path.join(packRoot, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const row of goatLocalePromoIngestFaces()) {
    const diskId = narutoDiskCardId(row.printedRef);
    if (!diskId) {
      failed.push(row.printedRef);
      continue;
    }
    const lang = row.lang.toLowerCase();
    const cardDir =
      narutoCardAbsDir(cardsDir, diskId, lang, row.setCode) ??
      path.join(cardsDir, "promo", diskId, lang);
    const key = `${diskId}/${lang}`;
    if (row.setCode) {
      upsertNarutoAppearances(packRoot, [
        { diskId, lang, appearanceSet: row.setCode },
      ]);
    }
    if (!options.force && existingNarutoArtForSource(cardDir, "goat")) {
      skipped.push(key);
      continue;
    }
    const buf = await downloadFaceImage(row.url, {
      referer: "https://goatcardsshop.crystalcommerce.com/",
      minBytes: 4_000,
    });
    if (!buf) {
      failed.push(key);
      continue;
    }
    if (row.staging) {
      const staging = path.join(packRoot, row.staging);
      mkdirSync(path.dirname(staging), { recursive: true });
      writeFileSync(staging, buf);
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "goat",
      lang,
      force: options.force,
    });
    if (saved === "skip") skipped.push(key);
    else written.push(key);
  }
  return { written, skipped, failed };
}

// ─── Carddas double-illustration faces ───────────────────────────

const CARDDAS_DOUBLE_LANG = "ja";

export type InstallCarddasDoubleIllustrationFacesOptions = {
  force?: boolean;
  root?: string;
};

/** Basename of the GIF listed in the carddasDoubleIllustrations (`jutsu-192_10.gif`). */
export function carddasDoubleGifBasename(gifField: string): string {
  const base = gifField.split("/").pop()?.trim() ?? "";
  return base.replace(/\s*\(.*\)$/, "").trim();
}

function findStagingGif(stagingRoot: string, basename: string): string | null {
  const candidates = [
    path.join(
      stagingRoot,
      "www.carddass.com/naruto/cardlist/card_img",
      basename,
    ),
    path.join(
      stagingRoot,
      "www.carddas.com/naruto/cardlist/card_img",
      basename,
    ),
  ];
  for (const abs of candidates) {
    if (existsSync(abs)) return abs;
  }
  return null;
}

export async function installCarddasDoubleIllustrationFaces(
  opts: InstallCarddasDoubleIllustrationFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const root = packRootOf(opts.root);
  const staging = path.join(root, NARUTO_STAGING_CARDDAS_JP);
  const cardsDir = path.join(root, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const row of carddasDoubleIllustrations.cards) {
    const diskId = String(row.number).trim().toLowerCase();
    const gifName = carddasDoubleGifBasename(row.gif);
    const gifAbs = findStagingGif(staging, gifName);
    if (!gifAbs) {
      failed.push(`${diskId}:missing-gif:${gifName}`);
      continue;
    }
    const cardDir =
      narutoCardAbsDir(cardsDir, diskId, CARDDAS_DOUBLE_LANG) ??
      path.join(cardsDir, "jutsu", diskId, CARDDAS_DOUBLE_LANG);
    const meta = await sharp(readFileSync(gifAbs)).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 8 || height < 16) {
      failed.push(`${diskId}:bad-gif`);
      continue;
    }
    const half = Math.floor(height / 2);
    const halves: { source: "carddas-a" | "carddas-b"; top: number }[] = [
      { source: "carddas-a", top: 0 },
      { source: "carddas-b", top: half },
    ];
    for (const halfRow of halves) {
      const key = `${diskId}/${halfRow.source}`;
      if (
        !opts.force &&
        existingNarutoArtForSource(cardDir, halfRow.source)
      ) {
        skipped.push(key);
        continue;
      }
      const buf = await sharp(gifAbs)
        .extract({
          left: 0,
          top: halfRow.top,
          width,
          height: half,
        })
        .png()
        .toBuffer();
      const saved = await saveNarutoFace({
        cardDir,
        buf,
        source: halfRow.source,
        lang: CARDDAS_DOUBLE_LANG,
        force: opts.force,
      });
      if (saved === "skip") skipped.push(key);
      else written.push(key);
    }
  }
  return { written, skipped, failed };
}

// ─── Carddas.jp staging faces ────────────────────────────────────

const CARDDAS_JP_LANG = "ja";

/** Double-height GIFs install via `installCarddasDoubleIllustrationFaces` only. */
const DOUBLE_GIF_BASENAMES = new Set(
  carddasDoubleIllustrations.cards.map((row) => carddasDoubleGifBasename(row.gif)),
);

export type InstallCarddasJpStagingFacesOptions = {
  force?: boolean;
  root?: string;
};

export async function installCarddasJpStagingFaces(
  opts: InstallCarddasJpStagingFacesOptions = {},
): Promise<{ listed: number; copied: number; skipped: number }> {
  const root = packRootOf(opts.root);
  const staging = path.join(root, NARUTO_STAGING_CARDDAS_JP);
  const cardsDir = path.join(root, "cards");
  const files = walkImageFiles(staging, /\.(gif|jpe?g|png|webp)$/i);
  let listed = 0;
  let copied = 0;
  let skipped = 0;
  console.log("── JA carddas.com GIFs → cards/{family}/{id}/ja/art.carddas.*");
  for (const abs of files) {
    const basename = path.basename(abs);
    if (DOUBLE_GIF_BASENAMES.has(basename)) continue;
    const diskId = carddasJpStagingFaceInstallTarget(basename);
    if (!diskId) continue;
    listed += 1;
    const cardDir =
      narutoCardAbsDir(cardsDir, diskId, CARDDAS_JP_LANG) ??
      path.join(cardsDir, "ninja", diskId, CARDDAS_JP_LANG);
    const buf = readFileSync(abs);
    if (extFromMagic(buf) === ".bin") continue;
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "carddas",
      lang: CARDDAS_JP_LANG,
      force: opts.force,
    });
    if (saved === "skip") skipped += 1;
    else copied += 1;
  }
  console.log(
    JSON.stringify({ carddasJpStagingFaces: true, listed, copied, skipped }),
  );
  return { listed, copied, skipped };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  installCarddasJpStagingFaces().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

// ─── Naruto CCG Drive faces ──────────────────────────────────────

/** @deprecated legacy normalized tree — still read for older harvests */
export const NARUTO_STAGING_DRIVE_ENHANCED = path.join(
  NARUTO_STAGING_DRIVE,
  "enhanced",
);

const DRIVE_LANG = "en";

export type InstallNarutoCcgDriveFacesOptions = {
  packRoot?: string;
  force?: boolean;
  limit?: number;
  /** Only install these official set codes (e.g. s1, promo). */
  sets?: readonly string[];
};

type DriveFaceCandidate = {
  filename: string;
  diskHint: string;
  tag: DriveFaceTag;
  setCode: string;
  stagingAbs: string;
};

type InstallStats = {
  written: string[];
  skipped: string[];
  failed: string[];
  unparsed: string[];
};

function stagingRoots(packRootDir: string): string[] {
  const base = path.join(packRootDir, NARUTO_STAGING_DRIVE);
  const candidates = [path.join(base, "hub"), path.join(base, "enhanced")];
  return candidates.filter(
    (dir) => existsSync(dir) && statSync(dir).isDirectory(),
  );
}

function cardDirFor(
  cardsDir: string,
  diskHint: string,
  diskId: string,
  setCode: string,
): string {
  const appearanceSet = driveFaceAppearanceSet(diskHint, setCode);
  return (
    narutoCardAbsDir(cardsDir, diskId, DRIVE_LANG, appearanceSet) ??
    path.join(
      cardsDir,
      parseNarutoCollector(diskHint)?.family ?? "ninja",
      diskId,
      DRIVE_LANG,
    )
  );
}

function collectStagingCandidates(
  packRootDir: string,
  setFilter: Set<string> | null,
  stats: InstallStats,
): DriveFaceCandidate[] {
  const rows: DriveFaceCandidate[] = [];
  for (const root of stagingRoots(packRootDir)) {
    for (const abs of walkImageFiles(root, /\.(png|jpe?g|webp)$/i)) {
      const relParts = path.relative(root, abs).split(path.sep);
      const setCode = driveOfficialSetCodeInPath(relParts);
      if (!setCode) continue;
      if (setFilter && !setFilter.has(setCode)) continue;
      const filename = path.basename(abs);
      const parsed = parseDriveNarutoFaceFilename(filename);
      if (!parsed) {
        stats.unparsed.push(path.join(root, ...relParts));
        continue;
      }
      rows.push({
        filename,
        diskHint: parsed.diskHint,
        tag: parsed.tag,
        setCode,
        stagingAbs: abs,
      });
    }
  }
  return groupDriveFaceWinners(rows);
}

function collectFansetFallbackCandidates(
  packRootDir: string,
  stats: InstallStats,
): DriveFaceCandidate[] {
  const rows: DriveFaceCandidate[] = [];
  for (const root of stagingRoots(packRootDir)) {
    for (const abs of walkImageFiles(root, /\.(png|jpe?g|webp)$/i)) {
      const relParts = path.relative(root, abs).split(path.sep);
      if (!drivePathIsFanset(relParts)) continue;
      const filename = path.basename(abs);
      const parsed = parseDriveNarutoFaceFilename(filename);
      if (!parsed) {
        stats.unparsed.push(path.join(root, ...relParts));
        continue;
      }
      rows.push({
        filename,
        diskHint: parsed.diskHint,
        tag: parsed.tag,
        setCode: "fanset",
        stagingAbs: abs,
      });
    }
  }
  return groupDriveFaceWinners(rows);
}

function existingEnCardDirForHint(
  cardsDir: string,
  diskHint: string,
): string | null {
  const diskId = narutoDiskCardId(diskHint);
  if (!diskId) return null;
  const family = parseNarutoCollector(diskHint)?.family;
  if (!family) return null;
  const diskDir = path.join(cardsDir, family, diskId);
  if (!existsSync(diskDir) || !statSync(diskDir).isDirectory()) return null;
  return path.join(diskDir, DRIVE_LANG);
}

async function installFansetFallback(
  cardsDir: string,
  row: DriveFaceCandidate,
  opts: InstallNarutoCcgDriveFacesOptions,
  stats: InstallStats,
): Promise<void> {
  const cardDir = existingEnCardDirForHint(cardsDir, row.diskHint);
  const diskId = narutoDiskCardId(row.diskHint) ?? row.diskHint;
  const key = `${diskId}/${DRIVE_LANG}`;
  if (!cardDir) {
    stats.skipped.push(key);
    return;
  }
  if (!opts.force && existingNarutoArtForSource(cardDir, "fanset")) {
    stats.skipped.push(key);
    return;
  }
  if (!existsSync(row.stagingAbs)) {
    stats.failed.push(key);
    return;
  }
  const raw = readFileSync(row.stagingAbs);
  const webp = await sharp(raw).webp({ quality: 92 }).toBuffer();
  const saved = await saveNarutoFace({
    cardDir,
    buf: webp,
    source: "fanset",
    lang: DRIVE_LANG,
    force: opts.force,
  });
  if (saved === "skip") stats.skipped.push(key);
  else stats.written.push(key);
}

export async function installNarutoCcgDriveFansetFallbacks(
  options: InstallNarutoCcgDriveFacesOptions = {},
): Promise<InstallStats> {
  const packRootDir = options.packRoot ?? packRootOf();
  const cardsDir = path.join(packRootDir, "cards");
  const stats: InstallStats = {
    written: [],
    skipped: [],
    failed: [],
    unparsed: [],
  };
  let winners = collectFansetFallbackCandidates(packRootDir, stats);
  if (options.limit != null) winners = winners.slice(0, options.limit);
  console.log(
    `── Drive Fansets staging → art.fanset.webp (${winners.length} files, only onto cards that already exist)`,
  );
  for (const row of winners) {
    await installFansetFallback(cardsDir, row, options, stats);
  }
  console.log(
    JSON.stringify({
      narutoCcgDriveFansetFallbacks: true,
      written: stats.written.length,
      skipped: stats.skipped.length,
      failed: stats.failed.length,
      unparsed: stats.unparsed.length,
    }),
  );
  return stats;
}

function groupDriveFaceWinners(
  rows: readonly DriveFaceCandidate[],
): DriveFaceCandidate[] {
  const byKey = new Map<string, DriveFaceCandidate[]>();
  for (const row of rows) {
    const key = `${row.setCode}/${row.diskHint}`;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }
  const winners: DriveFaceCandidate[] = [];
  for (const list of byKey.values()) {
    const winner = pickDriveFaceWinner(list);
    if (winner) winners.push(winner);
  }
  return winners;
}

async function installWinner(
  packRootDir: string,
  cardsDir: string,
  row: DriveFaceCandidate,
  opts: InstallNarutoCcgDriveFacesOptions,
  stats: InstallStats,
): Promise<void> {
  const diskId = driveFaceDiskId(row.diskHint, row.setCode);
  if (!diskId) {
    stats.failed.push(`${row.setCode}/${row.filename}`);
    return;
  }
  const appearanceSet = driveFaceAppearanceSet(row.diskHint, row.setCode);
  const cardDir = cardDirFor(cardsDir, row.diskHint, diskId, row.setCode);
  const key = `${diskId}/${DRIVE_LANG}`;
  upsertNarutoAppearances(packRootDir, [
    { diskId, lang: DRIVE_LANG, appearanceSet: appearanceSet ?? row.setCode },
  ]);
  if (!opts.force && existingNarutoArtForSource(cardDir, "drive")) {
    stats.skipped.push(key);
    return;
  }
  if (!existsSync(row.stagingAbs)) {
    stats.failed.push(key);
    return;
  }
  const raw = readFileSync(row.stagingAbs);
  const webp = await sharp(raw).webp({ quality: 92 }).toBuffer();
  const saved = await saveNarutoFace({
    cardDir,
    buf: webp,
    source: "drive",
    lang: DRIVE_LANG,
    force: opts.force,
  });
  if (saved === "skip") stats.skipped.push(key);
  else stats.written.push(key);
}

export async function installNarutoCcgDriveFaces(
  options: InstallNarutoCcgDriveFacesOptions = {},
): Promise<InstallStats> {
  const packRootDir = options.packRoot ?? packRootOf();
  const cardsDir = path.join(packRootDir, "cards");
  const stats: InstallStats = {
    written: [],
    skipped: [],
    failed: [],
    unparsed: [],
  };
  const setFilter = options.sets?.length
    ? new Set(options.sets.map((s) => s.trim().toLowerCase()))
    : null;
  let winners = collectStagingCandidates(packRootDir, setFilter, stats);
  if (options.limit != null) winners = winners.slice(0, options.limit);

  const officialSets = new Set(
    driveEnhancedFolders().map((row) => row.setCode),
  );
  console.log(
    `── Drive Enhanced staging → art.drive.webp (${winners.length} faces, sets officiels ${officialSets.size})`,
  );

  for (const row of winners) {
    await installWinner(packRootDir, cardsDir, row, options, stats);
  }

  console.log(
    JSON.stringify({
      narutoCcgDriveFaces: true,
      written: stats.written.length,
      skipped: stats.skipped.length,
      failed: stats.failed.length,
      unparsed: stats.unparsed.length,
    }),
  );
  return stats;
}

export async function installNarutoCcgDriveCardBack(
  options: Pick<InstallNarutoCcgDriveFacesOptions, "packRoot" | "force"> = {},
): Promise<"ok" | "skip" | "failed"> {
  const packRootDir = options.packRoot ?? packRootOf();
  const cardsDir = path.join(packRootDir, "cards");
  const dest = path.join(cardsDir, "back.en.webp");
  if (!options.force && existsSync(dest)) return "skip";
  const back = driveLedger.cardDatabase.cardBack;
  const candidates = [
    path.join(
      packRootDir,
      NARUTO_STAGING_DRIVE,
      "hub",
      driveStagingSegment(back.name),
    ),
    path.join(packRootDir, NARUTO_STAGING_DRIVE, back.name),
  ];
  const staging = candidates.find((file) => existsSync(file));
  if (!staging) return "failed";
  mkdirSync(cardsDir, { recursive: true });
  await sharp(readFileSync(staging)).webp({ quality: 92 }).toFile(dest);
  return "ok";
}

// ─── Coleka EN CCG covers ──────────────────────────────────────────────────

export const NARUTO_STAGING_COLEKA_EN_COVERS = path.join(
  "staging",
  "coleka-en-covers",
);

export type InstallColekaEnCoversOptions = {
  packRoot?: string;
  force?: boolean;
};

/**
 * Download Coleka EN CCG display packshots into
 * `data/naruto/carddass/staging/coleka-en-covers/{s13}.webp`.
 *
 * CDN thumbs are not behind the HTML verify wall. Kayou and Rampage stay
 * skipped. The Carddass FR branch cover is the full webp, never `_300x300`.
 */
export async function installColekaEnCcgCovers(
  options: InstallColekaEnCoversOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const destDir = path.join(packRoot, NARUTO_STAGING_COLEKA_EN_COVERS);
  mkdirSync(destDir, { recursive: true });
  const written: string[] = [];
  const skipped: string[] = [];
  for (const row of colekaEnCcgNewDisplays()) {
    const dest = path.join(destDir, `${row.set}.webp`);
    if (!options.force && existsSync(dest)) {
      skipped.push(row.set);
      continue;
    }
    const url = colekaThumbToFull(row.thumb);
    const buf = await downloadColekaCoverWebp(url);
    if (!buf) {
      skipped.push(row.set);
      continue;
    }
    writeFileSync(dest, buf);
    written.push(row.set);
  }
  const frDir = path.join(packRoot, "staging", "coleka-carddass-fr");
  mkdirSync(frDir, { recursive: true });
  const frDest = path.join(frDir, "branch-cover.webp");
  if (options.force || !existsSync(frDest)) {
    const frBuf = await downloadColekaCoverWebp(colekaCarddassFrBranchCoverUrl());
    if (frBuf) {
      writeFileSync(frDest, frBuf);
      written.push("carddass-fr");
    } else {
      skipped.push("carddass-fr");
    }
  } else {
    skipped.push("carddass-fr");
  }
  return { written, skipped };
}

async function downloadColekaCoverWebp(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: "https://www.coleka.com/" },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (buf.subarray(0, 4).toString() !== "RIFF") return null;
    return buf.byteLength >= 4_000 ? buf : null;
  } catch {
    return null;
  }
}
