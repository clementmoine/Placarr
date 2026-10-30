/**
 * Load Unity serialized ``.assets`` / split heads from a TCG Live APK (ADR-021 D).
 */

import "unityfs-js/decoders/DecoderManager.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { load, type AssetManager } from "unityfs-js";

const SERIALIZED_PREFIXES = [
  "assets/bin/data/sharedassets",
  "assets/bin/data/level",
  "assets/bin/data/globalgamemanagers",
  "assets/bin/data/resources",
] as const;

const SPLIT_TAIL_RE = /\.split[1-9]\d*$/i;
const UNITY_REVISION_FALLBACK = "6000.3.5f2";

function unityRevisionFromBytes(bytes: Buffer | Uint8Array): string {
  const buf = bytes instanceof Buffer ? bytes : Buffer.from(bytes);
  const text = buf.toString("latin1");
  const m = /(\d{4}\.\d+\.\d+f\d+)/.exec(text);
  return m?.[1] ?? UNITY_REVISION_FALLBACK;
}

function sortSplitNames(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const na = Number(/\.split(\d+)$/i.exec(a)?.[1] ?? 0);
    const nb = Number(/\.split(\d+)$/i.exec(b)?.[1] ?? 0);
    return na - nb;
  });
}

/** Merge ``name.split0`` + continuations when present. */
export function readSerializedHeadBytes(dataDir: string, headName: string): Buffer {
  const headPath = path.join(dataDir, headName);
  if (!headName.endsWith(".split0")) {
    return readFileSync(headPath);
  }
  const base = headName.replace(/\.split0$/i, "");
  const splits = sortSplitNames(
    readdirSync(dataDir).filter((n) => n.startsWith(`${base}.split`)),
  );
  if (splits.length <= 1) return readFileSync(headPath);
  return Buffer.concat(splits.map((n) => readFileSync(path.join(dataDir, n))));
}

export function listApkSerializedHeads(extractedDataDir: string): string[] {
  return readdirSync(extractedDataDir)
    .filter((name) => {
      const p = path.join(extractedDataDir, name);
      if (!statSync(p).isFile()) return false;
      if (SPLIT_TAIL_RE.test(name)) return false;
      const lower = name.toLowerCase();
      return SERIALIZED_PREFIXES.some((prefix) => {
        const tail = prefix.slice("assets/bin/data/".length);
        return lower.startsWith(tail);
      });
    })
    .sort();
}

export async function loadSerializedAssets(
  bytes: Buffer | Uint8Array,
): Promise<AssetManager> {
  const buf = bytes instanceof Buffer ? bytes : Buffer.from(bytes);
  return load(buf, { enableTypeTree: true, unityRevision: unityRevisionFromBytes(buf) });
}

export type ExtractedApkData = {
  tmpDir: string;
  dataDir: string;
  cleanup: () => void;
};

/** Extract ``assets/bin/Data/*`` from an APK into a temp directory. */
export function extractApkUnityData(apkPath: string): ExtractedApkData {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "placarr-apk-"));
  execFileSync("unzip", ["-q", apkPath, "assets/bin/Data/*", "-d", tmpDir], {
    stdio: "pipe",
  });
  const dataDir = path.join(tmpDir, "assets/bin/Data");
  return {
    tmpDir,
    dataDir,
    cleanup: () => rmSync(tmpDir, { recursive: true, force: true }),
  };
}

export function openApkUnityData(apkPath: string): ExtractedApkData {
  if (!statSync(apkPath).isFile()) {
    throw new Error(`APK not found: ${apkPath}`);
  }
  return extractApkUnityData(apkPath);
}
