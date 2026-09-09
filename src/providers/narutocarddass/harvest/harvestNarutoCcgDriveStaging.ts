/**
 * Archive the full Naruto CCG Google Drive hub under staging.
 *
 * Policy: download **everything** (Enhanced, Fansets, deck PNGs, rules PDFs,
 * Gimp templates…). Promotion into `cards/` or `products/` is a separate,
 * curated step — never skip a host dump at harvest time.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import driveLedger from "../curated/sources/naruto-ccg-drive.json";
import { NARUTO_PACK_ID } from "../packs";
import {
  driveDownloadUrl,
  driveEmbeddedFolderUrl,
  driveHubHarvestRoots,
  driveStagingSegment,
  parseDriveEmbeddedFolderHtml,
  type DriveFolderEntry,
} from "../parse/parseNarutoCcgDrive";

export const NARUTO_STAGING_DRIVE = path.join("staging", "naruto-ccg-drive");

/** Hub is "complete" when at least this many files are on disk (local unzip or HTTP). */
export const DRIVE_HUB_POPULATED_MIN_FILES = 500;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 120;
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

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

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
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
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
