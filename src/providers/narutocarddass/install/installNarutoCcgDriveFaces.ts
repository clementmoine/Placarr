/**
 * Promote Google Drive [Enhanced] staging scans into `cards/` as `art.drive.webp`.
 *
 * Reads `staging/naruto-ccg-drive/hub/` (full archive) — never downloads here.
 * Use `harvestNarutoCcgDriveStaging` first.
 *
 * `[Fansets]` files are not Bandai. They may be copied onto a card that
 * already exists as `art.fanset` (last rank, only shown when no other dump
 * is present). A fanset-only filename never mints a new print.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { dataRoot } from "@/lib/runtimeData";

import driveLedger from "../curated/sources/naruto-ccg-drive.json";
import { NARUTO_STAGING_DRIVE } from "../harvest/harvestNarutoCcgDriveStaging";
import { parseNarutoCollector, narutoDiskCardId } from "../collectorIdentity";
import { upsertNarutoAppearances } from "../migrateCardLayout";
import { narutoCardAbsDir } from "../narutoCardDisk";
import { existingNarutoArtForSource, saveNarutoFace } from "../narutoFaceBytes";
import { NARUTO_PACK_ID } from "../packs";
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
} from "../parse/parseNarutoCcgDrive";

/** @deprecated legacy normalized tree — still read for older harvests */
export const NARUTO_STAGING_DRIVE_ENHANCED = path.join(
  NARUTO_STAGING_DRIVE,
  "enhanced",
);

const LANG = "en";

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

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

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
    narutoCardAbsDir(cardsDir, diskId, LANG, appearanceSet) ??
    path.join(
      cardsDir,
      parseNarutoCollector(diskHint)?.family ?? "ninja",
      diskId,
      LANG,
    )
  );
}

function walkStagingFiles(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walkStagingFiles(abs));
    else if (/\.(png|jpe?g|webp)$/i.test(name)) out.push(abs);
  }
  return out;
}

function collectStagingCandidates(
  packRootDir: string,
  setFilter: Set<string> | null,
  stats: InstallStats,
): DriveFaceCandidate[] {
  const rows: DriveFaceCandidate[] = [];
  for (const root of stagingRoots(packRootDir)) {
    for (const abs of walkStagingFiles(root)) {
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
    for (const abs of walkStagingFiles(root)) {
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
  return path.join(diskDir, LANG);
}

async function installFansetFallback(
  cardsDir: string,
  row: DriveFaceCandidate,
  opts: InstallNarutoCcgDriveFacesOptions,
  stats: InstallStats,
): Promise<void> {
  const cardDir = existingEnCardDirForHint(cardsDir, row.diskHint);
  const diskId = narutoDiskCardId(row.diskHint) ?? row.diskHint;
  const key = `${diskId}/${LANG}`;
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
    lang: LANG,
    force: opts.force,
  });
  if (saved === "skip") stats.skipped.push(key);
  else stats.written.push(key);
}

export async function installNarutoCcgDriveFansetFallbacks(
  options: InstallNarutoCcgDriveFacesOptions = {},
): Promise<InstallStats> {
  const packRootDir = options.packRoot ?? packRoot();
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
  const key = `${diskId}/${LANG}`;
  upsertNarutoAppearances(packRootDir, [
    { diskId, lang: LANG, appearanceSet: appearanceSet ?? row.setCode },
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
    lang: LANG,
    force: opts.force,
  });
  if (saved === "skip") stats.skipped.push(key);
  else stats.written.push(key);
}

export async function installNarutoCcgDriveFaces(
  options: InstallNarutoCcgDriveFacesOptions = {},
): Promise<InstallStats> {
  const packRootDir = options.packRoot ?? packRoot();
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
  const packRootDir = options.packRoot ?? packRoot();
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
