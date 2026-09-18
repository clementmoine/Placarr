/**
 * Out-of-band No-Intro DAT pack sync — local zip (or opt-in URL download).
 * Scan path never calls this; index build still requires extracted `.dat`/`.xml`.
 */
import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

const DAT_FILE_RE = /\.(dat|xml)$/i;

export type NoIntroDatSyncOptions = {
  /** Local `.zip` of Logiqx DAT files (nested dirs OK). */
  packPath?: string;
  /** Remote zip URL — requires `allowDownload` / `NOINTRO_ALLOW_DOWNLOAD`. */
  packUrl?: string;
  /** Destination directory for extracted `.dat`/`.xml` (flat copy by basename). */
  destDir?: string;
  /** Intentional prebuild / tooling — may download. */
  allowDownload?: boolean;
};

export type NoIntroDatPackSource =
  { kind: "local"; path: string } | { kind: "url"; url: string };

export type NoIntroDatSyncResult = {
  destDir: string;
  files: string[];
  source: NoIntroDatPackSource;
};

function cacheDir(): string {
  return (
    process.env.NOINTRO_CACHE_DIR?.trim() ||
    path.join(process.cwd(), "data", "nointro")
  );
}

/** Opt-in network fetch of a DAT pack zip. Default: off (scan-safe). */
export function isNoIntroDownloadAllowed(
  options?: Pick<NoIntroDatSyncOptions, "allowDownload">,
): boolean {
  if (options?.allowDownload) return true;
  const raw = process.env.NOINTRO_ALLOW_DOWNLOAD?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function resolveNoIntroDatDestDir(
  options?: Pick<NoIntroDatSyncOptions, "destDir">,
): string {
  const explicit =
    options?.destDir?.trim() || process.env.NOINTRO_DAT_PATH?.trim();
  if (explicit) return explicit;
  return path.join(cacheDir(), "dats");
}

/**
 * Resolve pack source: local path wins, then URL when download is allowed.
 * Env: `NOINTRO_DAT_PACK` (local zip), `NOINTRO_DAT_PACK_URL` (remote).
 */
export function resolveNoIntroDatPackSource(
  options?: NoIntroDatSyncOptions,
): NoIntroDatPackSource | null {
  const local =
    options?.packPath?.trim() || process.env.NOINTRO_DAT_PACK?.trim() || "";
  if (local) {
    return { kind: "local", path: local };
  }

  const url =
    options?.packUrl?.trim() || process.env.NOINTRO_DAT_PACK_URL?.trim() || "";
  if (!url) return null;
  if (!isNoIntroDownloadAllowed(options)) return null;
  return { kind: "url", url };
}

/**
 * True when a DAT path or pack (local zip / allowed URL) is configured —
 * used so catalogue auto-sync does not treat an empty index as forever-stale.
 */
export function isNoIntroDatSourceConfigured(
  options?: NoIntroDatSyncOptions,
): boolean {
  if (process.env.NOINTRO_DAT_PATH?.trim()) return true;
  return (
    resolveNoIntroDatPackSource({
      ...options,
      // Catalogue refresh passes allowDownload; status should match that path.
      allowDownload: options?.allowDownload ?? true,
    }) != null
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

async function downloadDatPackZip(url: string): Promise<string | null> {
  await fs.mkdir(cacheDir(), { recursive: true });
  const zipPath = path.join(cacheDir(), "nointro-dat-pack.zip");
  try {
    const response = await httpGet<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: 10 * 60_000,
      maxContentLength: 512 * 1024 * 1024,
    });
    await fs.writeFile(zipPath, Buffer.from(response.data));
    return zipPath;
  } catch (error) {
    console.warn("[No-Intro] Failed to download DAT pack zip", error);
    return null;
  }
}

async function unzipToDir(zipPath: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const unzip = spawn("unzip", ["-o", zipPath, "-d", destDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    unzip.stderr.on("data", (chunk) => {
      console.warn("[No-Intro] unzip:", String(chunk));
    });
    unzip.on("error", reject);
    unzip.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`unzip exited with code ${code}`));
    });
  });
}

async function collectDatFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && DAT_FILE_RE.test(entry.name)) {
        found.push(full);
      }
    }
  }
  await walk(root);
  return found.sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * Copy DAT files into dest as a flat directory (basename).
 * Colliding basenames: later files overwrite (sorted walk is stable).
 */
async function flattenDatFilesInto(
  sources: string[],
  destDir: string,
): Promise<string[]> {
  await fs.mkdir(destDir, { recursive: true });
  const written: string[] = [];
  for (const source of sources) {
    const target = path.join(destDir, path.basename(source));
    await fs.copyFile(source, target);
    written.push(target);
  }
  return written.sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * Sync a DAT pack into the local DAT directory. Never used by scan/enrich.
 */
export async function syncNoIntroDatPack(
  options?: NoIntroDatSyncOptions,
): Promise<NoIntroDatSyncResult | null> {
  const source = resolveNoIntroDatPackSource(options);
  if (!source) {
    console.warn(
      "[No-Intro] No DAT pack — set NOINTRO_DAT_PACK (local zip) or NOINTRO_DAT_PACK_URL, then admin Local indexes",
    );
    return null;
  }

  let zipPath: string;
  if (source.kind === "local") {
    if (!(await fileExists(source.path))) {
      console.warn(`[No-Intro] DAT pack not found: ${source.path}`);
      return null;
    }
    zipPath = source.path;
  } else {
    const downloaded = await downloadDatPackZip(source.url);
    if (!downloaded) return null;
    zipPath = downloaded;
  }

  const destDir = resolveNoIntroDatDestDir(options);
  const extractRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "placarr-nointro-pack-"),
  );

  try {
    await unzipToDir(zipPath, extractRoot);
    const nested = await collectDatFiles(extractRoot);
    if (nested.length === 0) {
      console.warn(`[No-Intro] No .dat/.xml files inside pack ${zipPath}`);
      return null;
    }
    const files = await flattenDatFilesInto(nested, destDir);
    console.info(`[No-Intro] Synced ${files.length} DAT file(s) → ${destDir}`);
    return { destDir, files, source };
  } finally {
    await fs.rm(extractRoot, { recursive: true, force: true }).catch(() => {});
  }
}

export function __noIntroSyncPathsForTests() {
  return {
    cacheDir: cacheDir(),
    destDir: resolveNoIntroDatDestDir(),
    exists: existsSync,
  };
}
