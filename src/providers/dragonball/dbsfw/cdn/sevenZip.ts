/**
 * Locate a 7-Zip CLI that can open multi-volume archives (Xsolla full_game_.7z).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const CANDIDATES = ["7zz", "7zr", "7za", "7z"] as const;

function which(cmd: string): string | null {
  const r = spawnSync("which", [cmd], { encoding: "utf8" });
  const path = r.stdout?.trim();
  return r.status === 0 && path ? path : null;
}

function nodeModules7za(repo = process.cwd()): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("7zip-bin") as { path7za?: string };
    if (mod.path7za && existsSync(mod.path7za)) return mod.path7za;
  } catch {
    /* optional */
  }
  const plat =
    process.platform === "darwin"
      ? process.arch === "arm64"
        ? "mac/arm64"
        : "mac/x64"
      : process.platform === "win32"
        ? process.arch === "arm64"
          ? "win/arm64"
          : "win/x64"
        : process.arch === "arm64"
          ? "linux/arm64"
          : "linux/x64";
  const bin = join(
    repo,
    "node_modules/7zip-bin",
    plat,
    process.platform === "win32" ? "7za.exe" : "7za",
  );
  return existsSync(bin) ? bin : null;
}

/** Absolute path to a 7-Zip binary, or null. */
export function resolveSevenZipBinary(repo = process.cwd()): string | null {
  for (const name of CANDIDATES) {
    const hit = which(name);
    if (hit) return hit;
  }
  return nodeModules7za(repo);
}

export function requireSevenZipBinary(repo = process.cwd()): string {
  const bin = resolveSevenZipBinary(repo);
  if (!bin) {
    throw new Error(
      "7-Zip CLI missing (7zz/7za/7zr). Install p7zip or add dependency 7zip-bin.",
    );
  }
  return bin;
}
