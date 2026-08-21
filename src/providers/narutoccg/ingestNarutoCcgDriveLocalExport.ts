/**
 * Ingest a Google Drive **folder download** (often split into multiple zips).
 *
 * Drive exports look like `Naruto CCG-20260817T223052Z-1-001.zip` … `-006.zip`.
 * Each part is a standalone zip sharing the same root folder (`Naruto CCG/`).
 * Extract all parts into `staging/naruto-ccg-drive/`, then fold the root into `hub/`.
 */
import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { dataRoot } from "@/lib/runtimeData";

import driveLedger from "./curated/sources/naruto-ccg-drive.json";
import {
  NARUTO_STAGING_DRIVE,
  type DriveHarvestManifest,
} from "./harvestNarutoCcgDriveStaging";
import { driveHubHarvestRoots } from "./parseNarutoCcgDrive";
import { NARUTO_PACK_ID } from "./packs";

const execFileAsync = promisify(execFile);

/** Google Takeout / Drive multi-part folder export: `…-1-001.zip`. */
export const GOOGLE_DRIVE_MULTI_ZIP_RE =
  /^(.+)-(\d{8}T\d{6}Z-\d+-(\d{3}))\.zip$/i;

export type IngestNarutoCcgDriveLocalExportOptions = {
  /** Directory containing one or more `.zip` parts (or a single zip). */
  sourceDir: string;
  packRoot?: string;
  /** Re-extract even when `hub/` already has files. */
  force?: boolean;
};

export type DriveLocalExportStats = {
  zips: string[];
  extracted: number;
  skipped: number;
  hubRel: string;
};

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

function stagingBase(packRootDir: string): string {
  return path.join(packRootDir, NARUTO_STAGING_DRIVE);
}

function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) n += countFiles(abs);
    else n += 1;
  }
  return n;
}

/** Sorted zip paths under `sourceDir` (multi-part exports first, then any `.zip`). */
export function listGoogleDriveExportZips(sourceDir: string): string[] {
  if (!existsSync(sourceDir)) return [];
  const zips = readdirSync(sourceDir)
    .filter((name) => name.toLowerCase().endsWith(".zip"))
    .map((name) => path.join(sourceDir, name));
  return zips.sort((a, b) => {
    const ma = GOOGLE_DRIVE_MULTI_ZIP_RE.exec(path.basename(a));
    const mb = GOOGLE_DRIVE_MULTI_ZIP_RE.exec(path.basename(b));
    if (ma && mb) {
      const baseCmp = ma[1]!.localeCompare(mb[1]!);
      if (baseCmp !== 0) return baseCmp;
      return Number(ma[3]) - Number(mb[3]);
    }
    return path.basename(a).localeCompare(path.basename(b));
  });
}

/** Common label for a multi-part export (for logs / manifest). */
export function googleDriveExportLabel(sourceDir: string): string {
  const zips = listGoogleDriveExportZips(sourceDir);
  if (!zips.length) return sourceDir;
  const m = GOOGLE_DRIVE_MULTI_ZIP_RE.exec(path.basename(zips[0]!));
  return m?.[1] ?? path.basename(zips[0]!, ".zip");
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true });
  await execFileAsync("unzip", ["-o", "-q", zipPath, "-d", destDir], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

function mergeDirectoryInto(targetDir: string, sourceDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  for (const name of readdirSync(sourceDir)) {
    if (name.startsWith(".")) continue;
    const from = path.join(sourceDir, name);
    const to = path.join(targetDir, name);
    if (existsSync(to)) {
      const stFrom = statSync(from);
      const stTo = statSync(to);
      if (stFrom.isDirectory() && stTo.isDirectory()) {
        mergeDirectoryInto(to, from);
        continue;
      }
      if (stFrom.isFile() && stTo.isFile()) continue;
    }
    renameSync(from, to);
  }
}

function foldExportRootIntoHub(stagingDir: string): string {
  const hubDir = path.join(stagingDir, "hub");
  const roots = readdirSync(stagingDir).filter((name) => {
    if (name.startsWith(".") || name === "hub" || name === "manifest.json") {
      return false;
    }
    return statSync(path.join(stagingDir, name)).isDirectory();
  });
  if (roots.length === 1) {
    const only = path.join(stagingDir, roots[0]!);
    if (!existsSync(hubDir)) {
      renameSync(only, hubDir);
      return "hub";
    }
    mergeDirectoryInto(hubDir, only);
    rmSync(only, { recursive: true, force: true });
    return "hub";
  }
  if (roots.length > 1) {
    mkdirSync(hubDir, { recursive: true });
    for (const root of roots) {
      mergeDirectoryInto(hubDir, path.join(stagingDir, root));
      rmSync(path.join(stagingDir, root), { recursive: true, force: true });
    }
    return "hub";
  }
  return existsSync(hubDir) ? "hub" : "";
}

function writeLocalManifest(
  packRootDir: string,
  sourceDir: string,
  zips: readonly string[],
  fileCount: number,
): void {
  const manifest: DriveHarvestManifest & {
    localExport: true;
    sourceDir: string;
    zipParts: number;
    fileCount: number;
  } = {
    generatedAt: new Date().toISOString(),
    hubUrl: driveLedger.url,
    localExport: true,
    sourceDir,
    zipParts: zips.length,
    fileCount,
    roots: driveHubHarvestRoots().map((row) => ({
      label: row.label,
      stagingRel: row.stagingRel,
      folderId: row.id,
      downloaded: 0,
      skipped: 0,
      failed: 0,
    })),
  };
  writeFileSync(
    path.join(stagingBase(packRootDir), "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

/**
 * Extract every zip in `sourceDir` and merge into `staging/naruto-ccg-drive/hub/`.
 * Requires `unzip` on PATH (macOS / Linux).
 */
export async function ingestNarutoCcgDriveLocalExport(
  options: IngestNarutoCcgDriveLocalExportOptions,
): Promise<DriveLocalExportStats> {
  const packRootDir = options.packRoot ?? packRoot();
  const stagingDir = stagingBase(packRootDir);
  const hubDir = path.join(stagingDir, "hub");
  const zips = listGoogleDriveExportZips(options.sourceDir);

  if (!zips.length) {
    throw new Error(
      `No .zip files in ${options.sourceDir} (expected Google Drive folder export parts).`,
    );
  }

  const existing = countFiles(hubDir);
  if (existing > 0 && !options.force) {
    console.log(
      `── Drive local : hub/ déjà ${existing} fichiers — skip (utilise --force pour ré-extraire)`,
    );
    return {
      zips: zips.map((z) => path.basename(z)),
      extracted: 0,
      skipped: existing,
      hubRel: "hub",
    };
  }

  if (options.force && existsSync(stagingDir)) {
    for (const name of ["hub", ...readdirSync(stagingDir)]) {
      if (name === "manifest.json") continue;
      const abs = path.join(stagingDir, name);
      if (existsSync(abs) && statSync(abs).isDirectory()) {
        rmSync(abs, { recursive: true, force: true });
      }
    }
  }

  mkdirSync(stagingDir, { recursive: true });
  const label = googleDriveExportLabel(options.sourceDir);
  console.log(
    `── Drive local : ${zips.length} zip(s) « ${label} » → ${NARUTO_STAGING_DRIVE}/hub/`,
  );

  for (const zipPath of zips) {
    console.log(`   unzip ${path.basename(zipPath)}…`);
    await extractZip(zipPath, stagingDir);
  }

  const hubRel = foldExportRootIntoHub(stagingDir);
  const fileCount = countFiles(hubDir);
  writeLocalManifest(packRootDir, options.sourceDir, zips, fileCount);

  console.log(
    JSON.stringify({
      narutoCcgDriveLocalExport: true,
      zipParts: zips.length,
      hubFiles: fileCount,
    }),
  );

  return {
    zips: zips.map((z) => path.basename(z)),
    extracted: fileCount,
    skipped: 0,
    hubRel,
  };
}
