import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { FoilPackId, FoilPackStatus } from "./foilStatusTypes";
import { CATALOGUE_PACKS, type CatalogueExtractTarget } from "./cataloguePacks";

export type { FoilPackId, FoilPackStatus } from "./foilStatusTypes";

async function safeStat(filePath: string) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

async function listApks(
  apkDir: string,
): Promise<{ name: string; bytes: number; mtimeMs: number }[]> {
  let names: string[];
  try {
    names = await readdir(apkDir);
  } catch {
    return [];
  }
  const out: { name: string; bytes: number; mtimeMs: number }[] = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".apk")) continue;
    const info = await safeStat(path.join(apkDir, name));
    if (!info?.isFile()) continue;
    out.push({ name, bytes: info.size, mtimeMs: info.mtimeMs });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

async function countFiles(dir: string): Promise<number> {
  try {
    const names = await readdir(dir);
    let count = 0;
    for (const name of names) {
      const info = await safeStat(path.join(dir, name));
      if (info?.isFile()) count += 1;
    }
    return count;
  } catch {
    return 0;
  }
}

async function newestInTree(
  roots: string[],
): Promise<{ mtimeMs: number; path: string } | null> {
  let best: { mtimeMs: number; path: string } | null = null;
  for (const root of roots) {
    const info = await safeStat(root);
    if (!info) continue;
    if (info.isFile()) {
      if (!best || info.mtimeMs > best.mtimeMs) {
        best = { mtimeMs: info.mtimeMs, path: root };
      }
      continue;
    }
    if (!info.isDirectory()) continue;
    let names: string[];
    try {
      names = await readdir(root);
    } catch {
      continue;
    }
    for (const name of names) {
      const child = path.join(root, name);
      const childInfo = await safeStat(child);
      if (!childInfo?.isFile()) continue;
      if (!best || childInfo.mtimeMs > best.mtimeMs) {
        best = { mtimeMs: childInfo.mtimeMs, path: child };
      }
    }
  }
  return best;
}

function toIso(mtimeMs: number | null): string | null {
  if (mtimeMs == null) return null;
  return new Date(mtimeMs).toISOString();
}

/**
 * Observe on-disk APK + foil extract state for the admin APK lab.
 * Pure FS walk — one row per CATALOGUE_PACKS entry, paths from the registry.
 */
export async function readFoilPackStatuses(opts: {
  dataRoot: string;
  repoRoot: string;
}): Promise<FoilPackStatus[]> {
  const { dataRoot } = opts;

  const packs: Array<{
    id: FoilPackId;
    label: string;
    /** On-disk data pack (may nest: naruto/carddass, dbs/cg). */
    dataPack: string;
    staging: string;
    extractTarget: CatalogueExtractTarget;
    extractMarkers: string[];
  }> = CATALOGUE_PACKS.map((pack) => ({
    id: pack.extractTarget,
    label: pack.labelEn,
    dataPack: pack.id,
    staging: `${pack.id}/staging`,
    extractTarget: pack.extractTarget,
    extractMarkers: pack.extractMarkers.map((marker) =>
      path.join(dataRoot, pack.id, marker),
    ),
  }));

  const results: FoilPackStatus[] = [];
  for (const pack of packs) {
    const apkDir = path.join(dataRoot, pack.staging, "apks");
    const apks = await listApks(apkDir);
    const apkBytes = apks.reduce((sum, file) => sum + file.bytes, 0);
    const apkNewest = apks.reduce<number | null>(
      (best, file) =>
        best == null || file.mtimeMs > best ? file.mtimeMs : best,
      null,
    );

    const shadersDir = path.join(dataRoot, pack.dataPack, "foil", "shaders");
    const shaders = await countFiles(shadersDir);
    const extractBest = await newestInTree(pack.extractMarkers);
    const extractPresent =
      shaders > 0 ||
      (extractBest != null &&
        // Ignore tiny stub manifests / empty placeholders (< 200 bytes).
        ((await safeStat(extractBest.path))?.size ?? 0) > 200);

    const stale =
      extractPresent &&
      apkNewest != null &&
      extractBest != null &&
      apkNewest > extractBest.mtimeMs;

    const apkPresent = apks.length > 0;
    results.push({
      id: pack.id,
      label: pack.label,
      staging: pack.staging,
      apk: {
        present: apkPresent,
        files: apks.map(({ name, bytes }) => ({ name, bytes })),
        bytes: apkBytes,
        newestAt: toIso(apkNewest),
      },
      extract: {
        present: extractPresent,
        shaders: shaders > 0 ? shaders : null,
        newestAt: toIso(extractBest?.mtimeMs ?? null),
        stale,
      },
      canExtract: true,
      extractTarget: pack.extractTarget,
    });
  }
  return results;
}
