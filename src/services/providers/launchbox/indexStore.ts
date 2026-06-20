import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import axios from "axios";

import { parseLaunchBoxGameBlock, type LaunchBoxGameRecord } from "./parse";
export type { LaunchBoxGameRecord };

const DEFAULT_ZIP_URL = "https://gamesdb.launchbox-app.com/Metadata.zip";
const INDEX_VERSION = 1;

type LaunchBoxIndexFile = {
  version: number;
  builtAt: string;
  zipEtag?: string;
  games: LaunchBoxGameRecord[];
};

let memoryIndex: LaunchBoxGameRecord[] | null = null;
let indexBuildPromise: Promise<LaunchBoxGameRecord[] | null> | null = null;

function cacheDir(): string {
  return (
    process.env.LAUNCHBOX_CACHE_DIR?.trim() ||
    path.join(process.cwd(), ".cache", "launchbox")
  );
}

function indexPath(): string {
  return (
    process.env.LAUNCHBOX_INDEX_PATH?.trim() ||
    path.join(cacheDir(), "games-index.json")
  );
}

function zipPath(): string {
  return path.join(cacheDir(), "Metadata.zip");
}

function metadataXmlPath(): string {
  return (
    process.env.LAUNCHBOX_METADATA_XML?.trim() ||
    path.join(cacheDir(), "Metadata.xml")
  );
}

export function isLaunchBoxEnabled(): boolean {
  const flag = process.env.LAUNCHBOX_ENABLED?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no" || flag === "off") {
    return false;
  }
  return true;
}

function shouldBuildLaunchBoxIndex(): boolean {
  const flag = process.env.LAUNCHBOX_ENABLED?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes" || flag === "on") {
    return true;
  }
  if (flag === "0" || flag === "false" || flag === "no" || flag === "off") {
    return false;
  }

  return Boolean(
    process.env.LAUNCHBOX_METADATA_XML?.trim() ||
      process.env.LAUNCHBOX_METADATA_ZIP_URL?.trim(),
  );
}

function shouldDownloadLaunchBoxZip(): boolean {
  const flag = process.env.LAUNCHBOX_ENABLED?.trim().toLowerCase();
  return (
    flag === "1" ||
    flag === "true" ||
    flag === "yes" ||
    flag === "on" ||
    Boolean(process.env.LAUNCHBOX_METADATA_ZIP_URL?.trim())
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadMetadataZip(): Promise<string | null> {
  const zipUrl =
    process.env.LAUNCHBOX_METADATA_ZIP_URL?.trim() || DEFAULT_ZIP_URL;
  await fs.mkdir(cacheDir(), { recursive: true });

  try {
    const response = await axios.get<ArrayBuffer>(zipUrl, {
      responseType: "arraybuffer",
      timeout: 10 * 60_000,
      maxContentLength: 256 * 1024 * 1024,
    });
    await fs.writeFile(zipPath(), Buffer.from(response.data));
    return zipPath();
  } catch (error) {
    console.warn("[LaunchBox] Failed to download Metadata.zip", error);
    return null;
  }
}

async function extractMetadataXmlFromZip(): Promise<string | null> {
  if (!(await fileExists(zipPath()))) {
    if (!shouldDownloadLaunchBoxZip()) {
      return null;
    }
    const downloaded = await downloadMetadataZip();
    if (!downloaded) return null;
  }

  await fs.mkdir(cacheDir(), { recursive: true });
  const target = metadataXmlPath();

  await new Promise<void>((resolve, reject) => {
    const unzip = spawn("unzip", ["-p", zipPath(), "Metadata.xml"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = createWriteStream(target);
    unzip.stdout.pipe(output);
    unzip.stderr.on("data", (chunk) => {
      console.warn("[LaunchBox] unzip:", String(chunk));
    });
    unzip.on("error", reject);
    unzip.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`unzip exited with code ${code}`));
    });
  });

  return target;
}

async function resolveMetadataXmlSource(): Promise<string | null> {
  const explicitXml = process.env.LAUNCHBOX_METADATA_XML?.trim();
  if (explicitXml) {
    if (await fileExists(explicitXml)) {
      return explicitXml;
    }
    console.warn(`[LaunchBox] Configured XML file not found: ${explicitXml}`);
  }

  const cachedXml = metadataXmlPath();
  if (await fileExists(cachedXml)) {
    return cachedXml;
  }

  return extractMetadataXmlFromZip();
}

async function parseMetadataXmlFile(
  xmlFilePath: string,
): Promise<LaunchBoxGameRecord[]> {
  const games: LaunchBoxGameRecord[] = [];
  let buffer = "";

  for await (const chunk of createReadStream(xmlFilePath, {
    encoding: "utf8",
  })) {
    buffer += chunk;
    let start = buffer.indexOf("<Game>");
    while (start !== -1) {
      const end = buffer.indexOf("</Game>", start);
      if (end === -1) break;
      const block = buffer.slice(start, end + "</Game>".length);
      buffer = buffer.slice(end + "</Game>".length);
      const parsed = parseLaunchBoxGameBlock(block);
      if (parsed) games.push(parsed);
      start = buffer.indexOf("<Game>");
    }
    if (buffer.length > 2_000_000) {
      buffer = buffer.slice(-1_000_000);
    }
  }

  return games;
}

async function writeIndexFile(games: LaunchBoxGameRecord[]): Promise<void> {
  const payload: LaunchBoxIndexFile = {
    version: INDEX_VERSION,
    builtAt: new Date().toISOString(),
    games,
  };
  await fs.mkdir(path.dirname(indexPath()), { recursive: true });
  await fs.writeFile(indexPath(), JSON.stringify(payload));
}

async function readIndexFile(): Promise<LaunchBoxGameRecord[] | null> {
  const file = indexPath();
  if (!(await fileExists(file))) return null;

  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as LaunchBoxIndexFile;
    if (!Array.isArray(parsed?.games) || parsed.games.length === 0) {
      return null;
    }
    return parsed.games;
  } catch (error) {
    console.warn("[LaunchBox] Failed to read index file", error);
    return null;
  }
}

export async function buildLaunchBoxIndex(): Promise<
  LaunchBoxGameRecord[] | null
> {
  const xmlPath = await resolveMetadataXmlSource();
  if (!xmlPath) return null;

  console.info(`[LaunchBox] Building index from ${xmlPath}...`);
  const games = await parseMetadataXmlFile(xmlPath);
  if (games.length === 0) return null;

  await writeIndexFile(games);
  memoryIndex = games;
  console.info(`[LaunchBox] Index ready (${games.length} games)`);
  return games;
}

export async function ensureLaunchBoxIndex(): Promise<
  LaunchBoxGameRecord[] | null
> {
  if (memoryIndex?.length) return memoryIndex;

  const cached = await readIndexFile();
  if (cached?.length) {
    memoryIndex = cached;
    return cached;
  }

  if (!shouldBuildLaunchBoxIndex()) {
    return null;
  }

  if (!indexBuildPromise) {
    indexBuildPromise = buildLaunchBoxIndex().finally(() => {
      indexBuildPromise = null;
    });
  }

  return indexBuildPromise;
}

export function __resetLaunchBoxIndexForTests(): void {
  memoryIndex = null;
  indexBuildPromise = null;
}

export function __setLaunchBoxIndexForTests(
  games: LaunchBoxGameRecord[] | null,
): void {
  memoryIndex = games;
}

export function hashLaunchBoxQuery(value: string): string {
  return createHash("sha1").update(value.normalize("NFKC")).digest("hex");
}

export function getLaunchBoxCacheDir(): string {
  return cacheDir();
}

export function getLaunchBoxIndexPath(): string {
  return indexPath();
}

export function getLaunchBoxDefaultTempDir(): string {
  return path.join(os.tmpdir(), "placarr-launchbox");
}
