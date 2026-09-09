/**
 * Google Drive [Enhanced] Naruto CCG dumps (`j001.png`, `n1646.png`).
 *
 * Filenames are already collector ids (not TCDB PTHN). `[Errata]` is the
 * corrected scan of the same number — prefer it over the untagged file.
 * `[Foil Print]` is a finish of the same number — keep only when no base.
 */
import path from "node:path";

import driveLedger from "../curated/sources/naruto-ccg-drive.json";
import {
  canonicalNarutoDiskPrefix,
  narutoDiskCardId,
  parseNarutoCollector,
} from "../collectorIdentity";

const FILE_RE =
  /^(n|j|m|c|pr|ps|nus|jus|mus|cus|prus)(\d{1,4})(?:\s*\[([^\]]+)\])?$/i;

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

const TP_BY_SET: Record<string, string> = {
  "17.5": "tp1",
  "19.5": "tp2",
  "21.5": "tp3",
  "23.5": "tp4",
};

const RETAIL_CCG = new Set(["n", "j", "m", "c"]);

export type DriveFaceTag = "errata" | "foil" | null;

export type ParsedDriveNarutoFace = {
  stem: string;
  diskHint: string;
  tag: DriveFaceTag;
};

export type DriveFolderEntry = {
  id: string;
  name: string;
  kind: "file" | "folder";
};

export type DriveEnhancedFolder = {
  id: string;
  name: string;
  setCode: string;
};

export function decodeDriveTitle(raw: string): string {
  return raw
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export function parseDriveNarutoFaceFilename(
  filename: string,
): ParsedDriveNarutoFace | null {
  const base = filename
    .replace(/^Image\s+/i, "")
    .replace(/\s+Image$/i, "")
    .replace(/\s+Shared.*$/i, "")
    .trim();
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base).trim();
  const m = FILE_RE.exec(stem.replace(/\s+/g, " "));
  if (!m) return null;
  const prefix = m[1]!.toLowerCase();
  const digits = m[2]!;
  const tagRaw = (m[3] ?? "").trim().toLowerCase();
  let tag: DriveFaceTag = null;
  if (tagRaw === "errata") tag = "errata";
  else if (tagRaw === "foil print" || tagRaw === "foil") tag = "foil";
  return { stem, diskHint: `${prefix}${digits}`, tag };
}

export function driveFolderSetCode(folderName: string): string | null {
  const name = decodeDriveTitle(folderName);
  if (/^promos$/i.test(name)) return "promo";
  const tp = /^Set\s+(\d+\.5)\b/i.exec(name);
  if (tp) return TP_BY_SET[tp[1]!] ?? null;
  const booster = /^Set\s+(\d+)\b/i.exec(name);
  if (booster) {
    const n = Number(booster[1]);
    if (n >= 1 && n <= 28) return `s${n}`;
    return null;
  }
  return null;
}

export function driveEnhancedFolders(): DriveEnhancedFolder[] {
  return driveLedger.cardDatabase.enhanced.folders.flatMap((row) => {
    const setCode = row.setCode || driveFolderSetCode(row.name);
    if (!setCode) return [];
    return [{ id: row.id, name: row.name, setCode }];
  });
}

/** Retail N/J/M in the Promos tree are tin/tourney reprints, not the booster. */
export function driveFaceAppearanceSet(
  diskHint: string,
  folderSetCode: string,
): string | null {
  if (folderSetCode !== "promo") return folderSetCode;
  const id = parseNarutoCollector(diskHint);
  if (!id) return "promo";
  const prefix = canonicalNarutoDiskPrefix(id.printedPrefix);
  return RETAIL_CCG.has(prefix) ? "promo" : null;
}

export function driveFaceDiskId(
  diskHint: string,
  folderSetCode: string,
): string | null {
  return narutoDiskCardId(
    diskHint,
    driveFaceAppearanceSet(diskHint, folderSetCode),
  );
}

export function driveFaceRank(tag: DriveFaceTag): number {
  if (tag === "errata") return 3;
  if (tag === null) return 2;
  return 1;
}

export function pickDriveFaceWinner<T extends { tag: DriveFaceTag }>(
  rows: readonly T[],
): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (!best || driveFaceRank(row.tag) > driveFaceRank(best.tag)) best = row;
  }
  return best;
}

export function parseDriveEmbeddedFolderHtml(html: string): DriveFolderEntry[] {
  const out: DriveFolderEntry[] = [];
  const seen = new Set<string>();
  const re = /id="entry-([^"]+)"[\s\S]*?class="flip-entry-title">([^<]+)/g;
  for (const m of html.matchAll(re)) {
    const id = m[1]!;
    const name = decodeDriveTitle(m[2]!);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      kind: IMAGE_EXT.test(name) ? "file" : "folder",
    });
  }
  return out;
}

export function driveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`;
}

export function driveEmbeddedFolderUrl(folderId: string): string {
  return `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`;
}

/** Safe folder/file segment under `staging/naruto-ccg-drive/hub/`. */
export function driveStagingSegment(name: string): string {
  return decodeDriveTitle(name)
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export type DriveHarvestRoot = {
  id: string;
  stagingRel: string;
  label: string;
};

/** Every top-level hub folder — archive all of it under staging. */
export function driveHubHarvestRoots(): DriveHarvestRoot[] {
  return driveLedger.folders.map((row) => ({
    id: row.id,
    stagingRel: path.join("hub", driveStagingSegment(row.name)),
    label: row.name,
  }));
}

/** Official Enhanced set codes (Bandai s1–s28 + TP + promos). */
export function driveOfficialEnhancedSetCodes(): Set<string> {
  return new Set(driveEnhancedFolders().map((row) => row.setCode));
}

export function driveOfficialSetCodeInPath(
  parts: readonly string[],
): string | null {
  const official = driveOfficialEnhancedSetCodes();
  for (const seg of parts) {
    const lower = seg.toLowerCase();
    if (official.has(lower)) return lower;
    const code = driveFolderSetCode(seg);
    if (code && official.has(code)) return code;
  }
  return null;
}

/** Drive `[Fansets]` tree — remakes/customs, not Bandai Enhanced. */
export function drivePathIsFanset(parts: readonly string[]): boolean {
  return parts.some((seg) => /\[fansets\]/i.test(seg));
}
