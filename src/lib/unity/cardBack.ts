/**
 * TCG Live pack card back (`cardBack` Texture2D) from APK (ADR-021 phase D).
 */

import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { writeLosslessRgbaWebp } from "@/lib/media/losslessWebp";
import { cropCardRgba, type UvRect } from "@/core/render/unity/cardCrop";
import {
  resolveAssetManager,
  resourceBlobsFromAssetManager,
} from "@/lib/unity/loadUnityFs";
import { rgbaFromTexture2DObject } from "@/lib/unity/texture2d";

import "unityfs-js/decoders/DecoderManager.js";

const execFileAsync = promisify(execFile);
const CARD_BACK_NAMES = new Set(["cardback", "card_back"]);

/** Known hash for Live 1.41 base.apk — fallback when full-APK scan misses. */
export const CARD_BACK_ASSET_HASH = "b097d2eccfaea449e8ba9563d364d8d4";

function elapsedSec(started: number): string {
  return `${Math.round((Date.now() - started) / 1000)}s`;
}

function unityRevisionFromBytes(bytes: Buffer): string {
  const text = bytes.toString("latin1");
  const m = /(\d{4}\.\d+\.\d+f\d+)/.exec(text);
  return m?.[1] ?? "6000.3.5f2";
}

function isUnityAssetHashName(name: string): boolean {
  return /^[0-9a-f]{32}$/i.test(name);
}

async function unzipEntry(apkPath: string, entry: string): Promise<Buffer | null> {
  try {
    const { stdout } = await execFileAsync(
      "unzip",
      ["-p", apkPath, entry],
      { encoding: "buffer", maxBuffer: 256 * 1024 * 1024 },
    );
    const bytes = stdout as Buffer;
    return bytes.length ? bytes : null;
  } catch {
    return null;
  }
}

async function listApkDataEntries(apkPath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "unzip",
      ["-Z1", apkPath],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    return String(stdout)
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => /^assets\/bin\/Data\/[0-9a-f]{32}$/i.test(s));
  } catch {
    return [];
  }
}

async function loadCardBackBytesFromApk(apkPath: string): Promise<Buffer | null> {
  const started = Date.now();
  console.log(`  card back: unzip ${CARD_BACK_ASSET_HASH} from APK…`);
  const direct = await unzipEntry(apkPath, `assets/bin/Data/${CARD_BACK_ASSET_HASH}`);
  if (direct?.length) {
    console.log(`  card back: unzip ok (${direct.length} B, ${elapsedSec(started)})`);
    return direct;
  }
  console.log(`  card back: unzip miss — scanning APK Data/ entries…`);
  const scanStarted = Date.now();
  for (const entry of await listApkDataEntries(apkPath)) {
    const bytes = await unzipEntry(apkPath, entry);
    if (!bytes?.length || !bytes.includes(Buffer.from("cardBack"))) continue;
    try {
      const am = await resolveAssetManager(bytes, {
        unityRevision: unityRevisionFromBytes(bytes),
        enableTypeTree: false,
      });
      const info = am.getObjectInfoByName("cardBack");
      if (info?.object) {
        console.log(
          `  card back: scan hit ${entry.split("/").pop()} (${bytes.length} B, ${elapsedSec(scanStarted)})`,
        );
        return bytes;
      }
    } catch {
      /* try next */
    }
  }
  console.log(`  card back: scan miss (${elapsedSec(scanStarted)})`);
  return null;
}

/**
 * Files that may hold the `cardBack` Texture2D: hashed names (Android APK
 * `assets/bin/Data/`) first, then the desktop player's named serialized files
 * (`resources.assets`, `sharedassetsN.assets`, `levelN`) — same objects,
 * different file layout. Streamed `.resS` blobs are not candidates.
 */
export function cardBackCandidateFiles(dataDir: string): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dataDir);
  } catch {
    return [];
  }
  const isFile = (name: string) => {
    try {
      return statSync(path.join(dataDir, name)).isFile();
    } catch {
      return false;
    }
  };
  const hashed = entries.filter((n) => isUnityAssetHashName(n) && isFile(n));
  const named = entries.filter(
    (n) =>
      /^(resources\.assets|sharedassets\d+\.assets|level\d+|globalgamemanagers(\.assets)?)$/i.test(
        n,
      ) && isFile(n),
  );
  return [...hashed.sort(), ...named.sort()];
}

async function loadCardBackBytesFromDataDir(
  dataDir: string,
): Promise<{ bytes: Buffer; name: string } | null> {
  const file = path.join(dataDir, CARD_BACK_ASSET_HASH);
  if (existsSync(file)) {
    return { bytes: readFileSync(file), name: CARD_BACK_ASSET_HASH };
  }

  console.log(`  card back: hash file missing — scanning ${dataDir}…`);
  const scanStarted = Date.now();
  for (const name of cardBackCandidateFiles(dataDir)) {
    const full = path.join(dataDir, name);
    try {
      if (!statSync(full).isFile()) continue;
    } catch {
      continue;
    }
    const bytes = readFileSync(full);
    if (!bytes.length || !bytes.includes(Buffer.from("cardBack"))) continue;
    try {
      const am = await resolveAssetManager(bytes, {
        unityRevision: unityRevisionFromBytes(bytes),
        enableTypeTree: false,
      });
      const info = am.getObjectInfoByName("cardBack");
      if (info?.object) {
        console.log(
          `  card back: scan hit ${name} (${bytes.length} B, ${elapsedSec(scanStarted)})`,
        );
        return { bytes, name };
      }
    } catch {
      /* try next */
    }
  }
  console.log(`  card back: scan miss (${elapsedSec(scanStarted)})`);
  return null;
}

/**
 * Sibling `<file>.resS` of a standalone serialized file (desktop player):
 * the Texture2D `m_StreamData` points there, outside the AssetManager.
 */
function siblingStreamBlobs(
  dataDir: string,
  name: string,
): Map<string, Uint8Array> {
  const blobs = new Map<string, Uint8Array>();
  const resS = `${name}.resS`;
  const full = path.join(dataDir, resS);
  if (existsSync(full)) {
    const bytes = readFileSync(full);
    blobs.set(resS, bytes);
    blobs.set(resS.toLowerCase(), bytes);
  }
  return blobs;
}

async function cardBackRgbaFromBytes(
  bytes: Buffer,
  cropRect: UvRect | null,
  extraBlobs?: ReadonlyMap<string, Uint8Array>,
): Promise<{ rgba: Buffer; width: number; height: number } | null> {
  const parseStarted = Date.now();
  console.log(`  card back: parse Unity (${bytes.length} B)…`);
  const revision = unityRevisionFromBytes(bytes);
  const am = await resolveAssetManager(bytes, {
    unityRevision: revision,
    enableTypeTree: false,
  });
  const info = am.getObjectInfoByName("cardBack");
  if (!info?.object) {
    console.log(`  card back: no Texture2D cardBack (${elapsedSec(parseStarted)})`);
    return null;
  }
  console.log(`  card back: parse ok (${elapsedSec(parseStarted)})`);

  const decodeStarted = Date.now();
  console.log("  card back: decode Texture2D…");
  const resourceBlobs = resourceBlobsFromAssetManager(am);
  for (const [key, blob] of extraBlobs ?? []) {
    if (!resourceBlobs.has(key)) resourceBlobs.set(key, blob);
  }
  const decoded = await rgbaFromTexture2DObject(info.object, "cardBack", {
    resourceBlobs,
  });
  if (!decoded) {
    console.log(`  card back: decode miss (${elapsedSec(decodeStarted)})`);
    return null;
  }
  console.log(
    `  card back: decode ${decoded.width}×${decoded.height} (${elapsedSec(decodeStarted)})`,
  );

  if (!cropRect) return decoded;
  const cropped = cropCardRgba(
    decoded.rgba,
    decoded.width,
    decoded.height,
    cropRect,
  );
  return {
    rgba: cropped.rgba,
    width: cropped.width,
    height: cropped.height,
  };
}

export async function cardBackRgbaFromApk(
  apkPath: string,
  cropRect: UvRect | null,
): Promise<{ rgba: Buffer; width: number; height: number } | null> {
  const bytes = await loadCardBackBytesFromApk(apkPath);
  if (!bytes?.length) return null;
  return cardBackRgbaFromBytes(bytes, cropRect);
}

export async function cardBackRgbaFromDataDir(
  dataDir: string,
  cropRect: UvRect | null,
): Promise<{ rgba: Buffer; width: number; height: number } | null> {
  const hit = await loadCardBackBytesFromDataDir(dataDir);
  if (!hit?.bytes.length) {
    console.log("  card back: no cardBack asset found in extracted Data/");
    return null;
  }
  console.log(`  card back: read ${hit.name} (${hit.bytes.length} B)`);
  return cardBackRgbaFromBytes(
    hit.bytes,
    cropRect,
    siblingStreamBlobs(dataDir, hit.name),
  );
}

async function writeCardBackWebp(
  decoded: { rgba: Buffer; width: number; height: number },
  destPath: string,
): Promise<boolean> {
  const out = destPath.toLowerCase().endsWith(".webp")
    ? destPath
    : destPath.replace(/\.[^.]+$/, "") + ".webp";
  const started = Date.now();
  console.log(
    `  card back: write lossless webp ${decoded.width}×${decoded.height}…`,
  );
  await writeLosslessRgbaWebp(
    decoded.rgba,
    decoded.width,
    decoded.height,
    out,
  );
  console.log(`  card back: write ok (${elapsedSec(started)})`);
  const legacy = out.replace(/\.webp$/i, ".png");
  try {
    unlinkSync(legacy);
  } catch {
    /* ignore */
  }
  return true;
}

export async function dumpCardBackWebp(
  apkPath: string,
  destPath: string,
  cropRect: UvRect | null,
): Promise<boolean> {
  const decoded = await cardBackRgbaFromApk(apkPath, cropRect);
  if (!decoded) return false;
  return writeCardBackWebp(decoded, destPath);
}

export async function dumpCardBackFromDataDir(
  dataDir: string,
  destPath: string,
  cropRect: UvRect | null,
): Promise<boolean> {
  const decoded = await cardBackRgbaFromDataDir(dataDir, cropRect);
  if (!decoded) return false;
  return writeCardBackWebp(decoded, destPath);
}

export function isCardBackName(name: string): boolean {
  return CARD_BACK_NAMES.has(name.trim().toLowerCase());
}
