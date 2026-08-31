/**
 * TCG Live pack card back (`cardBack` Texture2D) from APK (ADR-021 phase D).
 */

import { execFileSync } from "node:child_process";
import { unlinkSync } from "node:fs";

import { writeLosslessRgbaWebp } from "@/lib/media/losslessWebp";
import { cropCardRgba, type UvRect } from "@/lib/unity/cardCrop";
import {
  resolveAssetManager,
  resourceBlobsFromAssetManager,
} from "@/lib/unity/loadUnityFs";
import { rgbaFromTexture2DObject } from "@/lib/unity/texture2d";

import "unityfs-js/decoders/DecoderManager.js";

const CARD_BACK_NAMES = new Set(["cardback", "card_back"]);

/** Known hash for Live 1.41 base.apk — fallback when full-APK scan misses. */
export const CARD_BACK_ASSET_HASH = "b097d2eccfaea449e8ba9563d364d8d4";

function unityRevisionFromBytes(bytes: Buffer): string {
  const text = bytes.toString("latin1");
  const m = /(\d{4}\.\d+\.\d+f\d+)/.exec(text);
  return m?.[1] ?? "6000.3.5f2";
}

function loadCardBackBytes(apkPath: string): Buffer | null {
  try {
    return execFileSync(
      "unzip",
      ["-p", apkPath, `assets/bin/Data/${CARD_BACK_ASSET_HASH}`],
      { maxBuffer: 256 * 1024 * 1024 },
    );
  } catch {
    return null;
  }
}

export async function cardBackRgbaFromApk(
  apkPath: string,
  cropRect: UvRect | null,
): Promise<{ rgba: Buffer; width: number; height: number } | null> {
  const bytes = loadCardBackBytes(apkPath);
  if (!bytes?.length) return null;

  const revision = unityRevisionFromBytes(bytes);
  const am = await resolveAssetManager(bytes, {
    unityRevision: revision,
    enableTypeTree: false,
  });
  const info = am.getObjectInfoByName("cardBack");
  if (!info?.object) return null;

  const decoded = await rgbaFromTexture2DObject(info.object, "cardBack", {
    resourceBlobs: resourceBlobsFromAssetManager(am),
  });
  if (!decoded) return null;

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

export async function dumpCardBackWebp(
  apkPath: string,
  destPath: string,
  cropRect: UvRect | null,
): Promise<boolean> {
  const decoded = await cardBackRgbaFromApk(apkPath, cropRect);
  if (!decoded) return false;

  const out = destPath.toLowerCase().endsWith(".webp")
    ? destPath
    : destPath.replace(/\.[^.]+$/, "") + ".webp";
  await writeLosslessRgbaWebp(
    decoded.rgba,
    decoded.width,
    decoded.height,
    out,
  );
  const legacy = out.replace(/\.webp$/i, ".png");
  try {
    unlinkSync(legacy);
  } catch {
    /* ignore */
  }
  return true;
}

export function isCardBackName(name: string): boolean {
  return CARD_BACK_NAMES.has(name.trim().toLowerCase());
}
