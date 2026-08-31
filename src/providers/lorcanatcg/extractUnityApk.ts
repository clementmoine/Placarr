/**
 * Merge Lorcana APK(s) → ``staging/unity-data`` (parity ``mobile.py``).
 */

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const UNITY_BUNDLE_NAMES = ["data.unity3d", "datapack.unity3d"] as const;

export function resolveUnityDataFile(dataDir: string): string {
  for (const name of UNITY_BUNDLE_NAMES) {
    const candidate = path.join(dataDir, name);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(
    `No data.unity3d or datapack.unity3d under ${dataDir}`,
  );
}

function apkHasUnityData(apkPath: string): boolean {
  try {
    const out = execFileSync("unzip", ["-Z1", apkPath], { encoding: "utf8" });
    return out.split("\n").some(
      (n) =>
        n.endsWith("/data.unity3d") ||
        n.endsWith("/datapack.unity3d") ||
        n === "assets/bin/Data/data.unity3d" ||
        n === "assets/bin/Data/datapack.unity3d",
    );
  } catch {
    return false;
  }
}

export function listUnityApks(apkDir: string): string[] {
  const apks = readdirSync(apkDir)
    .filter((n) => n.endsWith(".apk"))
    .map((n) => path.join(apkDir, n))
    .filter((p) => statSync(p).isFile() && apkHasUnityData(p));

  if (!apks.length) {
    throw new Error(`No Unity APK under ${apkDir}`);
  }

  return apks.sort((a, b) => {
    const na = path.basename(a).toLowerCase();
    const nb = path.basename(b).toLowerCase();
    const rank = (n: string) =>
      n === "base.apk" || n.endsWith("base.apk")
        ? 0
        : n.includes("unitydataassetpack")
          ? 1
          : 2;
    const ra = rank(na);
    const rb = rank(nb);
    return ra - rb || na.localeCompare(nb);
  });
}

function extractUnityDataFromApk(apkPath: string, dataDir: string): number {
  mkdirSync(dataDir, { recursive: true });
  execFileSync(
    "unzip",
    ["-q", "-o", apkPath, "assets/bin/Data/*", "-d", path.join(dataDir, "..")],
    { stdio: "pipe" },
  );
  const extracted = path.join(path.dirname(dataDir), "assets", "bin", "Data");
  if (!existsSync(extracted)) {
    throw new Error(`${path.basename(apkPath)}: missing assets/bin/Data/`);
  }
  let n = 0;
  for (const name of readdirSync(extracted)) {
    const src = path.join(extracted, name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, path.join(dataDir, name));
    n++;
  }
  rmSync(path.join(path.dirname(dataDir), "assets"), {
    recursive: true,
    force: true,
  });
  return n;
}

export function mergeApksToUnityData(apkPaths: string[], persistDir: string): string {
  const tmp = mkdtempSync(path.join(tmpdir(), "placarr-lorcana-apk-"));
  const extracted = path.join(tmp, "Data");
  mkdirSync(extracted, { recursive: true });
  let total = 0;
  for (const apk of apkPaths) {
    total += extractUnityDataFromApk(apk, extracted);
    console.log(`  Extracted files from ${path.basename(apk)} (total=${total})`);
  }
  if (existsSync(persistDir)) rmSync(persistDir, { recursive: true, force: true });
  cpSync(extracted, persistDir, { recursive: true });
  rmSync(tmp, { recursive: true, force: true });
  return persistDir;
}

export function resolveLorcanaUnityDataDir(opts: {
  repo: string;
  apk?: string | null;
  data?: string | null;
}): string {
  if (opts.data) {
    const dataDir = path.resolve(opts.data);
    if (!existsSync(dataDir) || !statSync(dataDir).isDirectory()) {
      throw new Error(`--data not a directory: ${dataDir}`);
    }
    return dataDir;
  }

  const persist = path.join(opts.repo, "data/lorcana/staging/unity-data");
  if (opts.apk) {
    const apk = path.resolve(opts.apk);
    const parent = path.dirname(apk);
    const inputs =
      existsSync(parent) && listUnityApks(parent).length > 1
        ? listUnityApks(parent)
        : [apk];
    return mergeApksToUnityData(inputs, persist);
  }

  if (existsSync(persist) && statSync(persist).isDirectory()) {
    return persist;
  }

  const defaultApks = path.join(opts.repo, "data/lorcana/staging/apks");
  if (existsSync(defaultApks)) {
    const inputs = listUnityApks(defaultApks);
    return mergeApksToUnityData(inputs, persist);
  }

  throw new Error(
    "lorcanamobile requires --apk, --data, or APKs under data/lorcana/staging/apks/",
  );
}

/** Primary bundle only — avoid datapack path_id collisions (see mobile.py). */
export function primaryUnityBundlePath(dataDir: string): string {
  const preferred = path.join(dataDir, "data.unity3d");
  if (existsSync(preferred)) return preferred;
  return resolveUnityDataFile(dataDir);
}

export function touchExtractMarker(dataDir: string): void {
  writeFileSync(path.join(dataDir, ".extract-source"), "node\n", "utf8");
}
