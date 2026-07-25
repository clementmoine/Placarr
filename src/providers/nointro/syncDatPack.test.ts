import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isNoIntroDownloadAllowed,
  resolveNoIntroDatDestDir,
  resolveNoIntroDatPackSource,
  syncNoIntroDatPack,
} from "./syncDatPack";

const SAMPLE_DAT = `<?xml version="1.0"?>
<datafile>
  <header><name>Nintendo - Game Boy</name></header>
  <game name="Tetris (World)">
    <description>Tetris (World)</description>
    <rom name="Tetris.gb" size="32768" crc="46df91ad"/>
  </game>
</datafile>
`;

async function makeZipWithNestedDat(dir: string): Promise<string> {
  const nested = path.join(dir, "pack", "systems");
  await fs.mkdir(nested, { recursive: true });
  await fs.writeFile(path.join(nested, "Nintendo - Game Boy.dat"), SAMPLE_DAT);
  await fs.writeFile(path.join(dir, "pack", "readme.txt"), "ignore me");
  const zipPath = path.join(dir, "nointro-pack.zip");
  await new Promise<void>((resolve, reject) => {
    const zip = spawn("zip", ["-r", zipPath, "pack"], {
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    zip.on("error", reject);
    zip.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`zip exited with code ${code}`));
    });
  });
  return zipPath;
}

describe("No-Intro DAT pack sync", () => {
  const originalAllow = process.env.NOINTRO_ALLOW_DOWNLOAD;
  const originalPack = process.env.NOINTRO_DAT_PACK;
  const originalUrl = process.env.NOINTRO_DAT_PACK_URL;
  const originalDat = process.env.NOINTRO_DAT_PATH;
  const originalCache = process.env.NOINTRO_CACHE_DIR;

  let tmpRoot: string;

  beforeEach(async () => {
    delete process.env.NOINTRO_ALLOW_DOWNLOAD;
    delete process.env.NOINTRO_DAT_PACK;
    delete process.env.NOINTRO_DAT_PACK_URL;
    delete process.env.NOINTRO_DAT_PATH;
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "placarr-nointro-sync-"));
    process.env.NOINTRO_CACHE_DIR = path.join(tmpRoot, "cache");
  });

  afterEach(async () => {
    if (originalAllow === undefined) delete process.env.NOINTRO_ALLOW_DOWNLOAD;
    else process.env.NOINTRO_ALLOW_DOWNLOAD = originalAllow;
    if (originalPack === undefined) delete process.env.NOINTRO_DAT_PACK;
    else process.env.NOINTRO_DAT_PACK = originalPack;
    if (originalUrl === undefined) delete process.env.NOINTRO_DAT_PACK_URL;
    else process.env.NOINTRO_DAT_PACK_URL = originalUrl;
    if (originalDat === undefined) delete process.env.NOINTRO_DAT_PATH;
    else process.env.NOINTRO_DAT_PATH = originalDat;
    if (originalCache === undefined) delete process.env.NOINTRO_CACHE_DIR;
    else process.env.NOINTRO_CACHE_DIR = originalCache;
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  });

  it("disallows pack download by default (scan-safe)", () => {
    expect(isNoIntroDownloadAllowed()).toBe(false);
    process.env.NOINTRO_DAT_PACK_URL = "https://example.test/pack.zip";
    expect(resolveNoIntroDatPackSource()).toBeNull();
  });

  it("allows download when options or env opt in", () => {
    process.env.NOINTRO_DAT_PACK_URL = "https://example.test/pack.zip";
    expect(resolveNoIntroDatPackSource({ allowDownload: true })).toEqual({
      kind: "url",
      url: "https://example.test/pack.zip",
    });

    process.env.NOINTRO_ALLOW_DOWNLOAD = "1";
    expect(isNoIntroDownloadAllowed()).toBe(true);
    expect(resolveNoIntroDatPackSource()).toEqual({
      kind: "url",
      url: "https://example.test/pack.zip",
    });
  });

  it("prefers local pack path over URL", () => {
    process.env.NOINTRO_DAT_PACK = "/tmp/local.zip";
    process.env.NOINTRO_DAT_PACK_URL = "https://example.test/pack.zip";
    process.env.NOINTRO_ALLOW_DOWNLOAD = "1";
    expect(resolveNoIntroDatPackSource()).toEqual({
      kind: "local",
      path: "/tmp/local.zip",
    });
  });

  it("defaults dest to cache/dats when NOINTRO_DAT_PATH unset", () => {
    expect(resolveNoIntroDatDestDir()).toBe(
      path.join(process.env.NOINTRO_CACHE_DIR!, "dats"),
    );
  });

  it("extracts nested .dat files from a local zip into dest", async () => {
    const zipPath = await makeZipWithNestedDat(tmpRoot);
    const destDir = path.join(tmpRoot, "dats");
    const result = await syncNoIntroDatPack({
      packPath: zipPath,
      destDir,
    });
    expect(result).not.toBeNull();
    expect(result!.files).toHaveLength(1);
    expect(result!.files[0]).toBe(
      path.join(destDir, "Nintendo - Game Boy.dat"),
    );
    const xml = await fs.readFile(result!.files[0]!, "utf8");
    expect(xml).toContain("Tetris (World)");
  });

  it("returns null when local pack is missing", async () => {
    await expect(
      syncNoIntroDatPack({
        packPath: path.join(tmpRoot, "missing.zip"),
        destDir: path.join(tmpRoot, "dats"),
      }),
    ).resolves.toBeNull();
  });
});
