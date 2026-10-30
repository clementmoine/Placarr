/**
 * Pull the installed APK(s) for one or more packs from a connected Android
 * device via ADB. Escapes the "mirror is dead / staging was purged" trap:
 * the device is always the source of truth for the bytes we already ship.
 *
 * Usage:
 *   pnpm apk:pull -- --pack pokemon
 *   pnpm apk:pull -- --pack lorcana --pack pokemon
 *   pnpm apk:pull -- --pack lorcana --device <serial>
 */
import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { cataloguePackInfo } from "@/lib/admin/cataloguePacks";
import { packApksDir } from "@/lib/packPaths";

const ADB_CANDIDATES = [
  process.env.ADB_PATH,
  "/opt/homebrew/bin/adb",
  "/usr/local/bin/adb",
  "adb",
].filter(Boolean) as string[];

function adbBin(): string {
  for (const c of ADB_CANDIDATES) {
    try {
      execFileSync(c, ["version"], { stdio: "ignore" });
      return c;
    } catch {
      /* try next */
    }
  }
  throw new Error("adb not found — set ADB_PATH or add platform-tools to PATH");
}

function sh(bin: string, args: string[]): string {
  return execFileSync(bin, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function deviceSerial(bin: string, requested?: string): string {
  if (requested) return requested;
  const out = sh(bin, ["devices"]);
  const lines = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("List of devices"));
  const attached = lines
    .map((l) => l.split(/\s+/))
    .filter((parts) => parts[1] === "device")
    .map((parts) => parts[0]);
  if (attached.length === 0) {
    throw new Error("no Android device attached (adb devices shows none)");
  }
  if (attached.length > 1) {
    throw new Error(
      `multiple devices attached (${attached.join(", ")}) — pass --device <serial>`,
    );
  }
  return attached[0];
}

function pmPaths(bin: string, serial: string, pkg: string): string[] {
  const out = sh(bin, ["-s", serial, "shell", "pm", "path", pkg]);
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("package:"))
    .map((l) => l.slice("package:".length));
}

function remoteSize(bin: string, serial: string, remote: string): number {
  const out = sh(bin, ["-s", serial, "shell", "stat", "-c", "%s", remote]);
  const n = Number(out.trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`cannot stat ${remote}: ${out.trim()}`);
  }
  return n;
}

function pullOne(
  bin: string,
  serial: string,
  remote: string,
  dest: string,
): void {
  const size = remoteSize(bin, serial, remote);
  mkdirSync(path.dirname(dest), { recursive: true });
  // exec-out streams raw bytes; redirect to file via node.
  const { execFileSync: exec } = require("node:child_process");
  const fs = require("node:fs");
  const buf = exec(bin, ["-s", serial, "exec-out", "cat", remote], {
    encoding: "buffer",
    maxBuffer: size + 1024 * 1024,
  }) as Buffer;
  if (buf.length !== size) {
    throw new Error(
      `size mismatch for ${remote}: pulled ${buf.length} B, expected ${size} B`,
    );
  }
  fs.writeFileSync(dest, buf);
}

function parseArgs(argv: string[]): { packs: string[]; device?: string } {
  const packs: string[] = [];
  let device: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pack" || a === "-p") {
      packs.push(argv[++i]);
    } else if (a === "--device" || a === "-d") {
      device = argv[++i];
    } else if (a.startsWith("--pack=")) {
      packs.push(a.slice("--pack=".length));
    } else if (a.startsWith("--device=")) {
      device = a.slice("--device=".length);
    }
  }
  if (packs.length === 0) packs.push("pokemon", "lorcana");
  return { packs, device };
}

async function main() {
  const { packs, device } = parseArgs(process.argv.slice(2));
  const bin = adbBin();
  const serial = deviceSerial(bin, device);
  console.log(`adb: ${bin}  device: ${serial}`);

  for (const pack of packs) {
    const info = cataloguePackInfo(pack);
    const pkg = info?.androidPackageId;
    if (!pkg) {
      console.error(`[${pack}] no androidPackageId — skip`);
      continue;
    }
    const destDir = packApksDir(pack);
    mkdirSync(destDir, { recursive: true });
    console.log(`\n[${pack}] ${pkg}`);
    const remotes = pmPaths(bin, serial, pkg);
    if (remotes.length === 0) {
      console.error(`[${pack}] pm path returned nothing`);
      continue;
    }
    for (const remote of remotes) {
      const name = path.basename(remote);
      const dest = path.join(destDir, name);
      process.stdout.write(`  ${name} ← ${remote} … `);
      pullOne(bin, serial, remote, dest);
      const size = statSync(dest).size;
      console.log(`ok (${(size / 1024 / 1024).toFixed(1)} MB)`);
    }
  }
  console.log("\ndone.");
}

void main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
