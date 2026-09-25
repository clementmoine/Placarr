/**
 * Naruto Carddass harvest actions (vol1 faces, Drive hub, product packshots).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { dataRoot } from "@/lib/runtimeData";
import { httpGet } from "@/lib/http/httpClient";
import {
  CARDDAS_JP_VOL1_WAYBACK_TIMESTAMPS,
  carddasJpVol1FaceOriginalUrls,
  carddasJpVol1FaceTargets,
  waybackImageUrl,
} from "./disk";
import { extFromMagic } from "./disk";
import { NARUTO_PACK_ID } from "./identity";
import { NARUTO_STAGING_CARDDAS_JP } from "./scrape/bandai";
import { fetchCdxRows, stagingRelFromUrl, WAYBACK_UA } from "./sources/titles";
import driveLedger from "./curated/sources/naruto-ccg-drive.json";
import {
  driveDownloadUrl,
  driveEmbeddedFolderUrl,
  driveHubHarvestRoots,
  driveStagingSegment,
  parseDriveEmbeddedFolderHtml,
  NARUTO_STAGING_DRIVE,
  type DriveFolderEntry,
} from "./parse/catalogues";

export { NARUTO_STAGING_DRIVE };
import comicplanet from "./curated/sources/comicplanet-de.json";
import official from "./curated/sources/carddass-official-products.json";
import surugaLedger from "./curated/sources/suruga-ya-kaitori-packshots.json";
import tvtokyo from "./curated/sources/tvtokyo-goods.json";
import { harvestBandaiPackshots } from "@/providers/naruto/shared/bandaiPackshots";
import { volumeNumber, volumeOfficialProducts, volumeProductFormat } from "./sealed";

// ─── shared helpers ─────────────────────────────────────────────────────

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// ─── harvestCarddasVol1Faces ──────────────────────────────────────────────────────────

/**
 * Targeted Wayback harvest for official 巻ノ壱 face GIFs (`*_1.gif`).
 * Fills nikita holes (e.g. N-003) when CDX retained the asset body.
 */
const vol1Faces_DEFAULT_DELAY_MS = 250;

export type HarvestCarddasVol1FacesOptions = {
  force?: boolean;
  root?: string;
  delayMs?: number;
  limit?: number;
};

function stagingDest(stagingDir: string, original: string): string | null {
  const rel = stagingRelFromUrl(original, {
    stripPathPrefix: "/naruto/",
    includeHost: true,
  });
  if (!rel) return null;
  const host = rel.split("/")[0] ?? "www.carddas.com";
  const rest = rel.slice(host.length + 1);
  const withNaruto = rest.startsWith("naruto/")
    ? rel
    : path.posix.join(host, "naruto", rest);
  return path.join(stagingDir, withNaruto.toLowerCase());
}

async function cdxTimestamp(original: string): Promise<string | null> {
  const encoded = encodeURIComponent(original);
  const url = `https://web.archive.org/cdx/search/cdx?url=${encoded}&output=json&fl=timestamp,statuscode&filter=statuscode:200&limit=1`;
  try {
    const response = await httpGet<string[][]>(url, {
      headers: { "user-agent": WAYBACK_UA },
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) return null;
    const raw = response.data;
    const row = raw[1];
    return row?.[0] ?? null;
  } catch {
    return null;
  }
}

async function tryDownload(
  dest: string,
  original: string,
  force: boolean,
): Promise<"ok" | "skip" | "fail"> {
  if (!force && existsSync(dest)) {
    const buf = readFileSync(dest);
    if (extFromMagic(buf) === ".gif") return "skip";
  }
  const ts = await cdxTimestamp(original);
  const timestamps = ts
    ? [ts, ...CARDDAS_JP_VOL1_WAYBACK_TIMESTAMPS.filter((t) => t !== ts)]
    : [...CARDDAS_JP_VOL1_WAYBACK_TIMESTAMPS];
  const { downloadRaw } = await import("./scrape/scrapeCards");
  for (const candidate of timestamps) {
    const url = waybackImageUrl(candidate, original);
    const result = await downloadRaw(url, dest, false);
    if (result === "fail") continue;
    const buf = readFileSync(dest);
    if (extFromMagic(buf) !== ".gif") {
      try {
        unlinkSync(dest);
      } catch {
        /* ignore */
      }
      continue;
    }
    return result;
  }
  return "fail";
}

export async function harvestCarddasVol1Faces(
  opts: HarvestCarddasVol1FacesOptions = {},
): Promise<{
  listed: number;
  downloaded: number;
  skipped: number;
  failed: number;
}> {
  const root = packRoot(opts.root);
  const stagingDir = path.join(root, NARUTO_STAGING_CARDDAS_JP);
  mkdirSync(stagingDir, { recursive: true });
  const force = opts.force === true;
  const delayMs = opts.delayMs ?? vol1Faces_DEFAULT_DELAY_MS;
  let targets = carddasJpVol1FaceTargets();
  if (opts.limit && opts.limit > 0) targets = targets.slice(0, opts.limit);

  console.log(
    `── JA carddas 巻ノ壱 *_1.gif → ${NARUTO_STAGING_CARDDAS_JP}/ (${targets.length} stems)`,
  );

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const log: Array<{ stem: string; number: string; result: string }> = [];

  for (const target of targets) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const originals = carddasJpVol1FaceOriginalUrls(target.stem);
    let result: "ok" | "skip" | "fail" = "fail";
    for (const original of originals) {
      const dest = stagingDest(stagingDir, original);
      if (!dest) continue;
      result = await tryDownload(dest, original, force);
      if (result !== "fail") break;
    }
    if (result === "ok") downloaded += 1;
    else if (result === "skip") skipped += 1;
    else failed += 1;
    log.push({ stem: target.stem, number: target.number, result });
    if (result === "fail") {
      console.log(`JA vol1 ${target.stem} (${target.number}) FAIL`);
    }
  }

  writeFileSync(
    path.join(stagingDir, "vol1-harvest.json"),
    `${JSON.stringify(
      {
        at: new Date().toISOString(),
        listed: targets.length,
        downloaded,
        skipped,
        failed,
        log,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify({
      carddasVol1Harvest: true,
      listed: targets.length,
      downloaded,
      skipped,
      failed,
    }),
  );
  return { listed: targets.length, downloaded, skipped, failed };
}

/** Optional bulk CDX sweep for any retained `*_1.gif` under card_img. */
export async function sweepCarddasVol1Cdx(): Promise<number> {
  const url =
    "https://web.archive.org/cdx/search/cdx?url=www.carddas.com/naruto/cardlist/card_img/*_1.gif&matchType=prefix&output=json&fl=timestamp,original,statuscode&filter=statuscode:200&collapse=urlkey&limit=5000";
  const rows = await fetchCdxRows(url, "JP carddas vol1 *_1.gif");
  return rows.length;
}

const thisFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === thisFile &&
  process.argv.includes("--vol1-faces")
) {
  harvestCarddasVol1Faces({
    limit: process.argv.includes("--limit")
      ? Number(process.argv[process.argv.indexOf("--limit") + 1])
      : undefined,
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

// ─── harvestNarutoCcgDriveStaging ──────────────────────────────────────────────────────────

/**
 * Archive the full Naruto CCG Google Drive hub under staging.
 *
 * Policy: download **everything** (Enhanced, Fansets, deck PNGs, rules PDFs,
 * Gimp templates…). Promotion into `cards/` or `products/` is a separate,
 * curated step — never skip a host dump at harvest time.
 */
/** Hub is "complete" when at least this many files are on disk (local unzip or HTTP). */
export const DRIVE_HUB_POPULATED_MIN_FILES = 500;

const ccgDriveStaging_DEFAULT_DELAY_MS = 120;
const DEFAULT_CONCURRENCY = 2;

export type HarvestNarutoCcgDriveStagingOptions = {
  packRoot?: string;
  force?: boolean;
  delayMs?: number;
  concurrency?: number;
  limit?: number;
  /** Restrict to these staging roots (`hub/card database`, `hub/_deck lists`, …). */
  roots?: readonly string[];
};

export type DriveHarvestStats = {
  downloaded: string[];
  skipped: string[];
  failed: string[];
};

export type DriveHarvestManifest = {
  generatedAt: string;
  hubUrl: string;
  roots: DriveHarvestRootManifest[];
  /** Set by `ingestNarutoCcgDriveLocalExport` — skip HTTP harvest unless `--force`. */
  localExport?: true;
  sourceDir?: string;
  zipParts?: number;
  fileCount?: number;
};

export type DriveHarvestRootManifest = {
  label: string;
  stagingRel: string;
  folderId: string;
  downloaded: number;
  skipped: number;
  failed: number;
};

export function stagingBase(packRootDir: string): string {
  return path.join(packRootDir, NARUTO_STAGING_DRIVE);
}

function countDriveHubFiles(hubDir: string): number {
  if (!existsSync(hubDir) || !statSync(hubDir).isDirectory()) return 0;
  let n = 0;
  for (const name of readdirSync(hubDir)) {
    if (name.startsWith(".")) continue;
    const abs = path.join(hubDir, name);
    const st = statSync(abs);
    if (st.isDirectory()) n += countDriveHubFiles(abs);
    else n += 1;
  }
  return n;
}

/** True when staging already holds a full hub (local export or prior harvest). */
export function driveStagingHubPopulated(
  packRootDir = packRoot(),
  minFiles = DRIVE_HUB_POPULATED_MIN_FILES,
): boolean {
  const manifest = readNarutoCcgDriveHarvestManifest(packRootDir);
  if (manifest?.localExport) return true;
  if ((manifest?.fileCount ?? 0) >= minFiles) return true;
  return (
    countDriveHubFiles(path.join(stagingBase(packRootDir), "hub")) >= minFiles
  );
}

export function driveStagingHubFileCount(packRootDir = packRoot()): number {
  const manifest = readNarutoCcgDriveHarvestManifest(packRootDir);
  if (manifest?.fileCount != null) return manifest.fileCount;
  return countDriveHubFiles(path.join(stagingBase(packRootDir), "hub"));
}

async function listDriveFolder(folderId: string): Promise<DriveFolderEntry[]> {
  const res = await httpGet<string>(driveEmbeddedFolderUrl(folderId), {
    headers: { "User-Agent": UA },
    responseType: "text",
    timeout: 60_000,
    validateStatus: (status) => status === 200,
  });
  return parseDriveEmbeddedFolderHtml(String(res.data));
}

async function downloadDriveFile(fileId: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(driveDownloadUrl(fileId), {
      headers: { "User-Agent": UA },
      responseType: "arraybuffer",
      timeout: 120_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    return buf.byteLength > 0 ? buf : null;
  } catch {
    return null;
  }
}

async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  delayMs: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  async function next(): Promise<void> {
    while (index < items.length) {
      const item = items[index++]!;
      await worker(item);
      if (delayMs > 0) await sleep(delayMs);
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => next()),
  );
}

type HarvestJob = {
  fileId: string;
  destAbs: string;
  rel: string;
};

async function collectFolderJobs(
  folderId: string,
  destDir: string,
  relPrefix: string,
  jobs: HarvestJob[],
): Promise<void> {
  const entries = await listDriveFolder(folderId);
  for (const entry of entries) {
    const segment = driveStagingSegment(entry.name);
    const rel = relPrefix ? `${relPrefix}/${segment}` : segment;
    if (entry.kind === "folder") {
      await collectFolderJobs(entry.id, path.join(destDir, segment), rel, jobs);
      continue;
    }
    jobs.push({
      fileId: entry.id,
      destAbs: path.join(destDir, segment),
      rel,
    });
  }
}

function writeManifest(
  packRootDir: string,
  rootStats: DriveHarvestRootManifest[],
): void {
  const manifest: DriveHarvestManifest = {
    generatedAt: new Date().toISOString(),
    hubUrl: driveLedger.url,
    roots: rootStats,
  };
  writeFileSync(
    path.join(stagingBase(packRootDir), "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

export async function harvestNarutoCcgDriveStaging(
  options: HarvestNarutoCcgDriveStagingOptions = {},
): Promise<DriveHarvestStats> {
  const packRootDir = options.packRoot ?? packRoot();
  const base = stagingBase(packRootDir);
  mkdirSync(base, { recursive: true });
  const stats: DriveHarvestStats = {
    downloaded: [],
    skipped: [],
    failed: [],
  };
  const rootFilter = options.roots?.length
    ? new Set(options.roots.map((s) => s.trim().toLowerCase()))
    : null;
  const roots = driveHubHarvestRoots().filter(
    (row) => !rootFilter || rootFilter.has(row.stagingRel.toLowerCase()),
  );
  const delayMs = options.delayMs ?? ccgDriveStaging_DEFAULT_DELAY_MS;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  let limit = options.limit ?? Number.POSITIVE_INFINITY;
  const rootStats: DriveHarvestRootManifest[] = [];

  console.log(
    `── Drive hub → ${NARUTO_STAGING_DRIVE}/hub/ (${roots.length} racines)`,
  );

  for (const root of roots) {
    if (limit <= 0) break;
    const destDir = path.join(base, root.stagingRel);
    mkdirSync(destDir, { recursive: true });
    const jobs: HarvestJob[] = [];
    await collectFolderJobs(root.id, destDir, root.stagingRel, jobs);
    const batch = jobs.slice(0, limit);
    limit -= batch.length;
    const perRoot: DriveHarvestRootManifest = {
      label: root.label,
      stagingRel: root.stagingRel,
      folderId: root.id,
      downloaded: 0,
      skipped: 0,
      failed: 0,
    };
    await runPool(batch, concurrency, delayMs, async (job) => {
      if (!options.force && existsSync(job.destAbs)) {
        const size = statSync(job.destAbs).size;
        if (size > 0) {
          stats.skipped.push(job.rel);
          perRoot.skipped += 1;
          return;
        }
      }
      const buf = await downloadDriveFile(job.fileId);
      if (!buf) {
        stats.failed.push(job.rel);
        perRoot.failed += 1;
        return;
      }
      mkdirSync(path.dirname(job.destAbs), { recursive: true });
      writeFileSync(job.destAbs, buf);
      stats.downloaded.push(job.rel);
      perRoot.downloaded += 1;
    });
    rootStats.push(perRoot);
    console.log(
      `── ${root.label} : ${perRoot.downloaded} DL, ${perRoot.skipped} déjà là, ${perRoot.failed} échecs`,
    );
  }

  const back = driveLedger.cardDatabase.cardBack;
  const backRel = path.join("hub", driveStagingSegment(back.name));
  const backAbs = path.join(base, backRel);
  if (options.force || !existsSync(backAbs) || statSync(backAbs).size === 0) {
    const buf = await downloadDriveFile(back.id);
    if (buf) {
      mkdirSync(path.dirname(backAbs), { recursive: true });
      writeFileSync(backAbs, buf);
      stats.downloaded.push(backRel);
    } else {
      stats.failed.push(backRel);
    }
  } else {
    stats.skipped.push(backRel);
  }

  writeManifest(packRootDir, rootStats);
  console.log(
    JSON.stringify({
      narutoCcgDriveStaging: true,
      downloaded: stats.downloaded.length,
      skipped: stats.skipped.length,
      failed: stats.failed.length,
    }),
  );
  return stats;
}

/** Read manifest if present (for tests / admin). */
export function readNarutoCcgDriveHarvestManifest(
  packRootDir = packRoot(),
): DriveHarvestManifest | null {
  const file = path.join(stagingBase(packRootDir), "manifest.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as DriveHarvestManifest;
  } catch {
    return null;
  }
}

// ─── harvestProductPackshots ──────────────────────────────────────────────────────────

/**
 * Remoissonne les visuels de produit qui vivent sous `staging/`.
 *
 *   npx tsx src/providers/naruto/narutocarddass/harvest.ts --product-packshots
 *
 * Ces trois lots étaient arrivés dans `staging/` par des scripts jetables, ce
 * qui violait la règle du pack : **`staging/` doit se reconstruire**. Sans
 * générateur au dépôt, un `rm -rf staging/` les perdait définitivement, et
 * personne ne pouvait vérifier d'où ils venaient.
 *
 * Chaque lot est piloté par son relevé curé, jamais par une liste écrite ici :
 *
 *   - `carddass-official/` ← `carddass-official-products.json` (fiches Bandai)
 *   - `comicplanet-de/`    ← `comicplanet-de.json` (packshots allemands)
 *   - `suruga-kaitori/`    ← `suruga-ya-kaitori-packshots.json` (photos de rachat)
 *   - `tv-tokyo/`          ← `tvtokyo-goods.json` (vignettes グッズねっと, toutes)
 *
 * Ce qui est **fait à la main** ne passe pas par ici : badges de série, logo du
 * jeu, emballages photographiés, sachets détourés et retouches de cadrage
 * vivent sous `curated/products/`, hors de portée d'une remoisson.
 */
/**
 * Sachets booster dont Bandai publie encore le packshot Akamai.
 * Aligné sur `OFFICIAL_BOOSTER_PACKSHOTS` dans sealed.ts.
 */
const OFFICIAL_BOOSTER_VOLS = new Set([12, 16, 17]);

const DELAY_MS = 1200;

export type HarvestResult = { folder: string; written: number; failed: number };

function stagingDir(folder: string, root?: string): string {
  const dir = path.join(
    root ?? path.join(dataRoot(), NARUTO_PACK_ID),
    "staging",
    folder,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function download(
  url: string,
  dest: string,
  referer?: string,
): Promise<boolean> {
  try {
    const res = await httpGet(url, {
      headers: { "User-Agent": UA, ...(referer ? { Referer: referer } : {}) },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const data = (res as { data?: ArrayBuffer }).data;
    if (!data) return false;
    writeFileSync(dest, Buffer.from(data));
    return true;
  } catch {
    return false;
  }
}

/**
 * Le nom de fichier attendu par les specs, pour un JAN donné.
 * Les specs sont la seule autorité : les recalculer ici les ferait diverger.
 */
export function officialFilesByJan(): Map<string, string> {
  const out = new Map<string, string>();
  /*
    Les specs du 疾風伝 étaient dans cette liste. Elles sont parties avec leur
    jeu le 2026-08-21 : ce pack ne rapatrie plus que ses propres visuels, et
    l'autre fait de même depuis son relevé.
  */
  for (const spec of volumeOfficialProducts()) {
    /*
      L'acte 1 n'a pas de JAN : Bandai ne lui a jamais fait de fiche, et son
      visuel vient du miroir carddas.com, pas du CDN Akamai. Rien à moissonner
      ici, donc rien à indexer.
    */
    if (spec.jan) out.set(spec.jan, spec.stagingFile);
  }
  /*
    Boosters 12/16/17 : même ledger Akamai, mais hors `volumeOfficialProducts`
    (qui ne couvre que vending + starters). Sans cette map, un wipe de
    `staging/carddass-official/` ne les remoissonnerait plus.
  */
  for (const row of official.products) {
    const volume = volumeNumber(row.title);
    if (volume == null || !OFFICIAL_BOOSTER_VOLS.has(volume)) continue;
    if (volumeProductFormat(row.title)) continue;
    if (!/ブースターパック/.test(row.title)) continue;
    out.set(row.jan, `booster-vol${volume}-jp.jpg`);
  }
  return out;
}

export async function harvestCarddassOfficial(
  opts: { root?: string; force?: boolean } = {},
): Promise<HarvestResult> {
  const result = await harvestBandaiPackshots({
    rows: official.products,
    fileByJan: officialFilesByJan(),
    destDir: stagingDir("carddass-official", opts.root),
    force: opts.force,
    delayMs: DELAY_MS,
  });
  return { folder: "carddass-official", ...result };
}

export async function harvestComicplanetDe(
  opts: { root?: string; force?: boolean } = {},
): Promise<HarvestResult> {
  const dir = stagingDir("comicplanet-de", opts.root);
  let written = 0;
  let failed = 0;
  for (const row of comicplanet.products) {
    if (!row.image) continue;
    const dest = path.join(dir, `${row.slug}.png`);
    if (!opts.force && existsSync(dest)) continue;
    if (await download(row.image, dest, "https://www.comicplanet.de/"))
      written += 1;
    else failed += 1;
    await sleep(DELAY_MS);
  }
  return { folder: "comicplanet-de", written, failed };
}

export async function harvestSurugaKaitori(
  opts: { root?: string; force?: boolean } = {},
): Promise<HarvestResult> {
  const dir = stagingDir("suruga-kaitori", opts.root);
  let written = 0;
  let failed = 0;
  for (const row of surugaLedger.products) {
    const dest = path.join(dir, `${row.slug}.webp`);
    if (!opts.force && existsSync(dest)) continue;
    /*
      Le site est derrière Cloudflare, son CDN ne l'est pas : on ne demande
      jamais la page, seulement l'image, par son identifiant.
    */
    const url = `https://cdn.suruga-ya.jp/database/pics_webp/game/${row.id}.jpg.webp`;
    if (await download(url, dest)) written += 1;
    else failed += 1;
    await sleep(DELAY_MS);
  }
  return { folder: "suruga-kaitori", written, failed };
}

export async function harvestTvTokyo(
  opts: { root?: string; force?: boolean } = {},
): Promise<HarvestResult> {
  const dir = stagingDir("tv-tokyo", opts.root);
  let written = 0;
  let failed = 0;
  for (const row of tvtokyo.products) {
    const stagingName =
      ("stagingFile" in row && typeof row.stagingFile === "string"
        ? row.stagingFile
        : null) || `${row.slug}.jpg`;
    const dest = path.join(dir, stagingName);
    if (!opts.force && existsSync(dest)) continue;
    const url = `${tvtokyo.base}cardimg/${row.file}`;
    if (await download(url, dest, tvtokyo.base)) written += 1;
    else failed += 1;
    await sleep(DELAY_MS);
  }
  return { folder: "tv-tokyo", written, failed };
}

export async function harvestNarutoProductPackshots(
  opts: { root?: string; force?: boolean } = {},
): Promise<HarvestResult[]> {
  return [
    await harvestCarddassOfficial(opts),
    await harvestComicplanetDe(opts),
    await harvestSurugaKaitori(opts),
    await harvestTvTokyo(opts),
  ];
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  for (const r of await harvestNarutoProductPackshots({ force })) {
    console.log(
      `── ${r.folder.padEnd(20)} ${r.written} écrits, ${r.failed} échecs`,
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes("--product-packshots")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
