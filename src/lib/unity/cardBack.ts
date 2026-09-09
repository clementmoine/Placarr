/**
 * TCG Live pack card back (`cardBack` Texture2D) from APK (ADR-021 phase D).
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { writeLosslessRgbaWebp } from "@/lib/media/losslessWebp";
import { cropCardRgba, type UvRect } from "@/lib/unity/cardCrop";
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

async function loadCardBackBytesFromApk(apkPath: string): Promise<Buffer | null> {
  const started = Date.now();
  console.log(`  card back: unzip ${CARD_BACK_ASSET_HASH} from APK…`);
  try {
    const { stdout } = await execFileAsync(
      "unzip",
      ["-p", apkPath, `assets/bin/Data/${CARD_BACK_ASSET_HASH}`],
      { encoding: "buffer", maxBuffer: 256 * 1024 * 1024 },
    );
    const bytes = stdout as Buffer;
    console.log(
      `  card back: unzip ok (${bytes.length} B, ${elapsedSec(started)})`,
    );
    return bytes.length ? bytes : null;
  } catch {
    console.log(`  card back: unzip miss (${elapsedSec(started)})`);
    return null;
  }
}

function loadCardBackBytesFromDataDir(dataDir: string): Buffer | null {
  const file = path.join(dataDir, CARD_BACK_ASSET_HASH);
  if (!existsSync(file)) return null;
  return readFileSync(file);
}

async function cardBackRgbaFromBytes(
  bytes: Buffer,
  cropRect: UvRect | null,
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
  const decoded = await rgbaFromTexture2DObject(info.object, "cardBack", {
    resourceBlobs: resourceBlobsFromAssetManager(am),
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
  const bytes = loadCardBackBytesFromDataDir(dataDir);
  if (!bytes?.length) {
    console.log("  card back: hash file missing in extracted Data/");
    return null;
  }
  console.log(`  card back: read extracted ${CARD_BACK_ASSET_HASH} (${bytes.length} B)`);
  return cardBackRgbaFromBytes(bytes, cropRect);
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
