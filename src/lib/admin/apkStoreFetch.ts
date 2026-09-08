/**
 * Store APK auto-fetch — no phone needed (`docs/foil_apk_sources.md` §Sync auto).
 *
 * Two mirrors, complementary coverage (verified live):
 * - **APKPure** hosts Lorcana but not TCG Live. Pages sit behind Cloudflare
 *   (probe goes through `fetchGetWithFlareFallback`); the artifact host
 *   `d.apkpure.com` 403s Node TLS even with Flare cookies, but its alternate
 *   host `d.cdnpure.com` serves the same paths unprotected (Obtainium does
 *   the same rewrite).
 * - **APKCombo** hosts TCG Live but lists no Lorcana variants. Its download
 *   page embeds a presigned R2 URL (no bot wall) plus the versionCode.
 *
 * Honest by construction: no parsable versionCode ⇒ `unavailable` (never a
 * guessed download); an XAPK whose manifest names another package is rejected.
 */

import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

import axios from "axios";

import { cataloguePackInfo } from "@/lib/admin/cataloguePacks";
import { flareSolverrCookiesFor } from "@/lib/http/flareSolverr";
import { fetchTextWithFlareFallback } from "@/lib/http/scrapeFetch";
import { packApksDir } from "@/lib/packPaths";

const execFileAsync = promisify(execFile);

const APKPURE_HOST = "https://apkpure.com";
/** `d.apkpure.com` paths, served without the Cloudflare wall. */
const APKPURE_CDN_HOST = "https://d.cdnpure.com";
const APKPURE_DOWNLOAD_HOST = "https://d.apkpure.com";
const APKCOMBO_HOST = "https://apkcombo.com";
/** Anti-runaway cap — Live/Lorcana artifacts are hundreds of MB, not GBs. */
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 20 * 60 * 1000;
const FALLBACK_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type ApkPureArtifactType = "XAPK" | "APK";

export type ApkPureLatest = {
  versionCode: number;
  type: ApkPureArtifactType;
};

export type ApkStoreSource = "apkpure" | "apkcombo";

/** One way to get the artifact — tried in order until a real ZIP lands. */
export type StoreDownloadAttempt = {
  label: string;
  url: string;
  /** Solve this page first and carry its cookies + UA on the download. */
  flareCookiesReferer?: string;
};

export type StoreLatest = {
  source: ApkStoreSource;
  versionCode: number;
  attempts: StoreDownloadAttempt[];
};

/**
 * Provenance + freshness of `data/<pack>/staging/apks/`.
 * `versionCode` is only set when the files on disk came from the store —
 * a missing code means unknown provenance, never a confident lie.
 */
export type ApkStoreMeta = {
  packageId: string;
  source: ApkStoreSource;
  /** Last successful store probe (bumped even when already up to date). */
  checkedAt: string;
  versionCode?: number;
  fetchedAt?: string;
  files?: string[];
};

export type ApkStoreFetchResult =
  | { status: "unavailable"; reason: string }
  | { status: "up-to-date"; versionCode: number }
  | { status: "updated"; versionCode: number; files: string[] };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Newest download link on an APKPure app / download page:
 * `https://d.apkpure.com/b/XAPK/<pkg>?versionCode=NNN`.
 * XAPK wins over APK at equal versionCode (splits carry the Unity data pack).
 */
export function parseApkPureLatestVersion(
  html: string,
  packageId: string,
): ApkPureLatest | null {
  const pattern = new RegExp(
    `/b/(XAPK|APK)/${escapeRegExp(packageId)}\\?versionCode=(\\d+)`,
    "gi",
  );
  let best: ApkPureLatest | null = null;
  for (const match of html.matchAll(pattern)) {
    const type: ApkPureArtifactType =
      match[1]!.toUpperCase() === "XAPK" ? "XAPK" : "APK";
    const versionCode = Number(match[2]);
    if (!Number.isFinite(versionCode) || versionCode <= 0) continue;
    if (
      !best ||
      versionCode > best.versionCode ||
      (versionCode === best.versionCode && type === "XAPK")
    ) {
      best = { versionCode, type };
    }
  }
  return best;
}

/** `.apk` entries at the root of an XAPK zip listing (base + splits). */
export function apkEntriesFromZipListing(names: string[]): string[] {
  return names.filter(
    (name) =>
      name.length > 0 &&
      !name.includes("/") &&
      name.toLowerCase().endsWith(".apk"),
  );
}

/**
 * XAPK entry name → device-pull convention. `pm path` pulls are named
 * `base.apk` / `split_<name>.apk` and that is what the extract runners look
 * for (`preferredLorcanaApk` wants `split_UnityDataAssetPack.apk` exactly),
 * while XAPKs ship `<packageId>.apk` / `UnityDataAssetPack.apk`.
 */
export function normalizedApkFileName(
  entry: string,
  packageId: string,
): string {
  const lower = entry.toLowerCase();
  if (lower === "base.apk" || lower === `${packageId.toLowerCase()}.apk`) {
    return "base.apk";
  }
  if (lower.startsWith("split_")) return entry;
  return `split_${entry}`;
}

/** `package_name` claimed by an XAPK `manifest.json` (null = unreadable). */
export function xapkManifestPackageId(manifestJson: string): string | null {
  try {
    const parsed = JSON.parse(manifestJson) as { package_name?: unknown };
    return typeof parsed.package_name === "string" && parsed.package_name
      ? parsed.package_name
      : null;
  } catch {
    return null;
  }
}

/**
 * APKCombo download page → versionCode + presigned R2 URL.
 * The page embeds `href="/r2?u=<urlencoded presigned URL>"` next to
 * `vercode">(NNN)`; the decoded URL downloads without any bot wall.
 */
export function parseApkComboDownload(
  html: string,
  packageId: string,
): { versionCode: number; url: string } | null {
  const href = html.match(/href="\/r2\?u=([^"&]+)[^"]*"/i)?.[1];
  if (!href) return null;
  let url: string;
  try {
    url = decodeURIComponent(href);
  } catch {
    return null;
  }
  if (!/^https:\/\//i.test(url) || !url.includes(packageId)) return null;

  // versionCode from the download box, or from the artifact path itself
  // (`…/<versionCode>.<sha1>.apks`).
  const fromSpan = Number(html.match(/vercode">\((\d+)\)/)?.[1]);
  const fromPath = Number(url.match(/\/(\d+)\.[0-9a-f]{16,}\.\w+\?/i)?.[1]);
  const versionCode = Number.isFinite(fromSpan)
    ? fromSpan
    : Number.isFinite(fromPath)
      ? fromPath
      : NaN;
  if (!Number.isFinite(versionCode) || versionCode <= 0) return null;
  return { versionCode, url };
}

/**
 * Download when the store version is provably newer than what the store
 * itself installed. Unknown provenance (no versionCode) ⇒ fetch once to
 * establish the tracked baseline.
 */
export function shouldDownloadStoreApk(
  meta: ApkStoreMeta | null,
  latest: { versionCode: number },
  options: { force?: boolean; hasApks: boolean },
): boolean {
  if (options.force) return true;
  if (!options.hasApks) return true;
  if (typeof meta?.versionCode !== "number") return true;
  return latest.versionCode > meta.versionCode;
}

export function apkStoreMetaPath(pack: string): string {
  return path.join(packApksDir(pack), "apk-store-meta.json");
}

export async function readApkStoreMeta(
  pack: string,
): Promise<ApkStoreMeta | null> {
  try {
    const raw = await readFile(apkStoreMetaPath(pack), "utf8");
    const parsed = JSON.parse(raw) as ApkStoreMeta;
    if (parsed && typeof parsed.packageId === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function writeApkStoreMeta(
  pack: string,
  meta: ApkStoreMeta,
): Promise<void> {
  await mkdir(packApksDir(pack), { recursive: true });
  await writeFile(apkStoreMetaPath(pack), JSON.stringify(meta, null, 2));
}

/**
 * Latest store version for a package. The `/p/<pkg>` page usually carries the
 * versioned download link; otherwise follow the page's own `…/download` link.
 */
export async function probeApkPureLatest(
  packageId: string,
  signal?: AbortSignal,
): Promise<ApkPureLatest | null> {
  const appPage = await fetchTextWithFlareFallback(
    `${APKPURE_HOST}/p/${packageId}`,
    { timeout: 25_000, flareMaxTimeoutMs: 60_000, signal },
  );
  if (!appPage) return null;

  const direct = parseApkPureLatestVersion(appPage, packageId);
  if (direct) return direct;

  const downloadPath = appPage.match(
    new RegExp(
      `["'](?:https?://apkpure\\.com)?(/[^"'\\s]+/${escapeRegExp(packageId)}/download[^"'\\s]*)["']`,
      "i",
    ),
  )?.[1];
  if (!downloadPath) return null;

  const downloadPage = await fetchTextWithFlareFallback(
    `${APKPURE_HOST}${downloadPath}`,
    { timeout: 25_000, flareMaxTimeoutMs: 60_000, signal },
  );
  if (!downloadPage) return null;
  return parseApkPureLatestVersion(downloadPage, packageId);
}

/** APKCombo probe — generic `a` slug redirects to the app's download page. */
export async function probeApkComboLatest(
  packageId: string,
  signal?: AbortSignal,
): Promise<{ versionCode: number; url: string } | null> {
  const html = await fetchTextWithFlareFallback(
    `${APKCOMBO_HOST}/a/${packageId}/download/apk`,
    { timeout: 25_000, flareMaxTimeoutMs: 60_000, signal },
  );
  if (!html) return null;
  return parseApkComboDownload(html, packageId);
}

function apkPureArtifactUrl(
  host: string,
  packageId: string,
  type: ApkPureArtifactType,
  versionCode: number,
): string {
  return `${host}/b/${type}/${packageId}?versionCode=${versionCode}`;
}

/**
 * Latest version + ordered download attempts across mirrors.
 * APKPure first (Lorcana lives there), APKCombo second (TCG Live only there).
 */
export async function probeStoreLatest(
  packageId: string,
  signal?: AbortSignal,
  log: (line: string) => void = () => {},
): Promise<StoreLatest | null> {
  log(`probe APKPure ${packageId}…`);
  const pure = await probeApkPureLatest(packageId, signal);
  if (pure) {
    const altType: ApkPureArtifactType = pure.type === "XAPK" ? "APK" : "XAPK";
    return {
      source: "apkpure",
      versionCode: pure.versionCode,
      attempts: [
        {
          label: "cdnpure",
          url: apkPureArtifactUrl(
            APKPURE_CDN_HOST,
            packageId,
            pure.type,
            pure.versionCode,
          ),
        },
        {
          label: "apkpure+flare",
          url: apkPureArtifactUrl(
            APKPURE_DOWNLOAD_HOST,
            packageId,
            pure.type,
            pure.versionCode,
          ),
          flareCookiesReferer: `${APKPURE_HOST}/p/${packageId}`,
        },
        {
          label: "cdnpure-alt",
          url: apkPureArtifactUrl(
            APKPURE_CDN_HOST,
            packageId,
            altType,
            pure.versionCode,
          ),
        },
      ],
    };
  }

  log(`probe APKCombo ${packageId}…`);
  const combo = await probeApkComboLatest(packageId, signal);
  if (combo) {
    return {
      source: "apkcombo",
      versionCode: combo.versionCode,
      attempts: [{ label: "apkcombo-r2", url: combo.url }],
    };
  }
  return null;
}

async function fileIsZip(filePath: string): Promise<boolean> {
  try {
    const handle = await open(filePath, "r");
    try {
      const { buffer, bytesRead } = await handle.read(
        Buffer.alloc(2),
        0,
        2,
        0,
      );
      return bytesRead === 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

async function downloadToFile(
  url: string,
  dest: string,
  options: { cookie?: string; userAgent?: string; signal?: AbortSignal },
): Promise<{ ok: boolean; detail: string }> {
  try {
    const response = await axios.get(url, {
      responseType: "stream",
      maxRedirects: 10,
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxContentLength: MAX_ARTIFACT_BYTES,
      validateStatus: () => true,
      signal: options.signal,
      headers: {
        "User-Agent": options.userAgent ?? FALLBACK_UA,
        Accept: "*/*",
        ...(options.cookie ? { Cookie: options.cookie } : {}),
      },
    });
    const stream = response.data as NodeJS.ReadableStream & {
      destroy?: () => void;
    };
    if (response.status >= 400) {
      stream.destroy?.();
      return { ok: false, detail: `HTTP ${response.status}` };
    }
    const declared = Number(response.headers["content-length"] ?? "");
    if (Number.isFinite(declared) && declared > MAX_ARTIFACT_BYTES) {
      stream.destroy?.();
      return { ok: false, detail: `artifact too large (${declared} bytes)` };
    }
    await pipeline(stream, createWriteStream(dest));
  } catch (error) {
    if (axios.isCancel(error) || (error as Error)?.name === "AbortError") {
      throw error;
    }
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  if (!(await fileIsZip(dest))) {
    // Cloudflare interstitial or an error page — never install it.
    await rm(dest, { force: true });
    return { ok: false, detail: "response is not a ZIP (challenge page?)" };
  }
  return { ok: true, detail: "ok" };
}

async function listZipEntries(filePath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("unzip", ["-Z1", filePath], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

async function readZipEntry(
  filePath: string,
  entry: string,
): Promise<string> {
  const { stdout } = await execFileAsync("unzip", ["-p", filePath, entry], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Install a downloaded artifact into `data/<pack>/staging/apks/`.
 * XAPK ⇒ its root `.apk` entries (base + splits); plain APK ⇒ `base.apk`.
 * Existing `.apk` files are removed first — mixing splits of two versions
 * would hand Unity an inconsistent dump.
 */
export async function installApkArtifact(
  pack: string,
  artifactPath: string,
  expectedPackageId: string,
): Promise<string[]> {
  const entries = await listZipEntries(artifactPath);
  const apkEntries = apkEntriesFromZipListing(entries);
  const destDir = packApksDir(pack);
  await mkdir(destDir, { recursive: true });

  const clearOldApks = async () => {
    for (const name of await readdir(destDir)) {
      if (name.toLowerCase().endsWith(".apk")) {
        await unlink(path.join(destDir, name));
      }
    }
  };

  if (apkEntries.length > 0) {
    // XAPK container. Its manifest must claim the package we asked for.
    if (entries.includes("manifest.json")) {
      const claimed = xapkManifestPackageId(
        await readZipEntry(artifactPath, "manifest.json"),
      );
      if (claimed && claimed !== expectedPackageId) {
        throw new Error(
          `XAPK manifest claims ${claimed}, expected ${expectedPackageId}`,
        );
      }
    }
    const tmp = await mkdtemp(path.join(tmpdir(), "placarr-xapk-"));
    try {
      await execFileAsync(
        "unzip",
        ["-q", "-o", artifactPath, ...apkEntries, "-d", tmp],
        { maxBuffer: 16 * 1024 * 1024 },
      );
      await clearOldApks();
      const installed: string[] = [];
      for (const name of apkEntries) {
        const normalized = normalizedApkFileName(name, expectedPackageId);
        await rename(path.join(tmp, name), path.join(destDir, normalized));
        installed.push(normalized);
      }
      return installed;
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  if (entries.includes("AndroidManifest.xml")) {
    await clearOldApks();
    await rename(artifactPath, path.join(destDir, "base.apk"));
    return ["base.apk"];
  }

  throw new Error("Downloaded artifact is neither an XAPK nor an APK");
}

async function listInstalledApks(pack: string): Promise<string[]> {
  try {
    return (await readdir(packApksDir(pack))).filter((name) =>
      name.toLowerCase().endsWith(".apk"),
    );
  } catch {
    return [];
  }
}

/**
 * Probe → compare → download → install → stamp meta.
 * Every outcome is written down: `checkedAt` moves on success paths so the
 * auto loop backs off, and `unavailable` never touches the files on disk.
 */
export async function fetchStoreApksForPack(
  pack: string,
  options: {
    force?: boolean;
    signal?: AbortSignal;
    onLog?: (line: string) => void;
  } = {},
): Promise<ApkStoreFetchResult> {
  const log = options.onLog ?? (() => {});
  const info = cataloguePackInfo(pack);
  const packageId = info?.androidPackageId;
  if (!packageId) {
    return { status: "unavailable", reason: `no androidPackageId for ${pack}` };
  }

  const latest = await probeStoreLatest(packageId, options.signal, log);
  const meta = await readApkStoreMeta(pack);
  const now = new Date().toISOString();

  if (!latest) {
    // Stamp the attempt so the auto loop backs off instead of hammering
    // mirrors that are down — the files on disk stay untouched.
    await writeApkStoreMeta(pack, {
      ...(meta ?? { packageId, source: "apkpure" as const }),
      checkedAt: now,
    });
    return {
      status: "unavailable",
      reason: `no versionCode found on any mirror for ${packageId}`,
    };
  }
  log(`latest ${latest.source} versionCode=${latest.versionCode}`);

  const hasApks = (await listInstalledApks(pack)).length > 0;
  if (!shouldDownloadStoreApk(meta, latest, { force: options.force, hasApks })) {
    await writeApkStoreMeta(pack, { ...meta!, checkedAt: now });
    log(`up to date (versionCode=${meta!.versionCode})`);
    return { status: "up-to-date", versionCode: meta!.versionCode! };
  }

  const tmpDir = await mkdtemp(path.join(tmpdir(), "placarr-apk-"));
  const artifact = path.join(tmpDir, `${packageId}.artifact`);
  try {
    let lastDetail = "";
    let downloaded = false;
    for (const attempt of latest.attempts) {
      let cookie: string | undefined;
      let userAgent: string | undefined;
      if (attempt.flareCookiesReferer) {
        const solved = await flareSolverrCookiesFor(
          attempt.flareCookiesReferer,
          undefined,
          options.signal,
        );
        if (!solved) {
          lastDetail = `${attempt.label}: no FlareSolverr cookies`;
          continue;
        }
        cookie = solved.cookie;
        userAgent = solved.userAgent;
      }
      log(`download (${attempt.label}) ${attempt.url.split("?")[0]}`);
      const result = await downloadToFile(attempt.url, artifact, {
        cookie,
        userAgent,
        signal: options.signal,
      });
      if (result.ok) {
        downloaded = true;
        break;
      }
      lastDetail = `${attempt.label}: ${result.detail}`;
      log(`  ${lastDetail}`);
    }
    if (!downloaded) {
      // Back off (checkedAt) but never pretend a version was installed.
      await writeApkStoreMeta(pack, {
        ...(meta ?? { packageId, source: latest.source }),
        checkedAt: now,
      });
      return {
        status: "unavailable",
        reason: `download failed — ${lastDetail}`,
      };
    }

    const files = await installApkArtifact(pack, artifact, packageId);
    await writeApkStoreMeta(pack, {
      packageId,
      source: latest.source,
      checkedAt: now,
      versionCode: latest.versionCode,
      fetchedAt: now,
      files,
    });
    log(`installed ${files.join(", ")} → data/${pack}/staging/apks/`);
    return { status: "updated", versionCode: latest.versionCode, files };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
