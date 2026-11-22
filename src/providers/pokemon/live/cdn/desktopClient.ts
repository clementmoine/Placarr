/**
 * Client du jeu Pokémon TCG Live — build desktop publié par l'éditeur.
 *
 * L'updater officiel (`rainier/updater/StandaloneOSX/Manifest.json`, CDN de
 * l'éditeur, sans auth) nomme l'archive complète du client (`Contents.zip`)
 * et sa MD5. Son `Contents/Resources/Data/` porte les mêmes données Unity que
 * `assets/bin/Data` de l'APK Android : maillage `Card` (→ `card-uv-rect.json`)
 * et dos de carte. Les miroirs d'APK ne l'hébergent plus (APKPure : absent ;
 * APKCombo : domaine mort, 2026-11) — c'est la source que la Sync rebranche.
 *
 * Version = MD5 de l'archive : retéléchargée seulement quand elle change.
 */
import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { httpGet } from "@/lib/http/httpClient";
import { packLogsDir, packStagingDir } from "@/lib/packPaths";
import type {
  ProviderClientOpts,
  ProviderClientOutcome,
} from "@/types/providerModule";

const execFileAsync = promisify(execFile);

export const POKEMON_UPDATER_MANIFEST_URL =
  "https://cdn.studio-prod.pokemon.com/rainier/updater/StandaloneOSX/Manifest.json";

/** Archive root of the Unity player data inside `Contents.zip`. */
const ZIP_DATA_PREFIX = "Contents/Resources/Data";

const CLIENT_DIR = "desktop-client";

export type UpdaterArtifact = { url: string; md5: string };

export type DesktopClientMeta = {
  md5: string;
  url?: string;
  fetchedAt?: string;
  checkedAt?: string;
};

/** Publisher CDN only (contentpath hosts moved .com → .biz once). */
function isPublisherUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      /(^|\.)pokemon\.(com|biz)$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}

export function parseUpdaterManifest(json: unknown): UpdaterArtifact | null {
  if (!json || typeof json !== "object") return null;
  const artifact = (json as { CompressedArtifact?: unknown })
    .CompressedArtifact;
  if (!artifact || typeof artifact !== "object") return null;
  const { MD5, Url } = artifact as { MD5?: unknown; Url?: unknown };
  if (typeof MD5 !== "string" || !/^[0-9a-f]{32}$/i.test(MD5)) return null;
  if (typeof Url !== "string" || !isPublisherUrl(Url)) return null;
  return { url: Url, md5: MD5.toLowerCase() };
}

export function desktopClientNeedsDownload(
  meta: Pick<DesktopClientMeta, "md5"> | null,
  latest: Pick<UpdaterArtifact, "md5">,
  options: { hasData: boolean; force?: boolean },
): boolean {
  if (options.force) return true;
  if (!options.hasData) return true;
  return meta?.md5 !== latest.md5;
}

/** Unpacked desktop `Data/` under the pack staging dir, when usable. */
export function pokemonClientDataDir(stagingDir: string): string | null {
  const dataDir = path.join(stagingDir, CLIENT_DIR, "Data");
  if (!existsSync(dataDir)) return null;
  try {
    const hasSerialized = readdirSync(dataDir).some((name) =>
      /^(sharedassets\d+\.assets|resources\.assets|level\d+)$/i.test(name),
    );
    return hasSerialized ? dataDir : null;
  } catch {
    return null;
  }
}

function metaPath(packId: string): string {
  return path.join(packLogsDir(packId), "desktop-client-meta.json");
}

export function readDesktopClientMeta(
  packId: string,
): DesktopClientMeta | null {
  try {
    const parsed = JSON.parse(
      readFileSync(metaPath(packId), "utf8"),
    ) as DesktopClientMeta;
    return typeof parsed?.md5 === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeDesktopClientMeta(packId: string, meta: DesktopClientMeta): void {
  mkdirSync(packLogsDir(packId), { recursive: true });
  writeFileSync(metaPath(packId), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

async function md5OfFile(file: string): Promise<string> {
  const hash = createHash("md5");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

async function downloadArchive(
  url: string,
  dest: string,
  signal?: AbortSignal,
): Promise<void> {
  const partial = `${dest}.partial`;
  const res = await httpGet<Readable>(url, {
    responseType: "stream",
    // Délai jusqu'aux en-têtes : ~210 Mo s'écoulent ensuite à leur rythme.
    timeout: 120_000,
    signal,
  });
  mkdirSync(path.dirname(dest), { recursive: true });
  await pipeline(res.data, createWriteStream(partial));
  renameSync(partial, dest);
}

/** `Contents/Resources/Data/*` (sans les banques audio) → `<client>/Data`. */
async function unpackData(zipPath: string, clientDir: string): Promise<void> {
  const tmp = path.join(clientDir, "unpack");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  await execFileAsync(
    "unzip",
    [
      "-q",
      zipPath,
      `${ZIP_DATA_PREFIX}/*`,
      "-x",
      `${ZIP_DATA_PREFIX}/StreamingAssets/*`,
      "-d",
      tmp,
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const unpacked = path.join(tmp, ZIP_DATA_PREFIX);
  if (!existsSync(unpacked)) {
    throw new Error(`client archive has no ${ZIP_DATA_PREFIX}/`);
  }
  const dataDir = path.join(clientDir, "Data");
  rmSync(dataDir, { recursive: true, force: true });
  renameSync(unpacked, dataDir);
  rmSync(tmp, { recursive: true, force: true });
}

/** `catalog.ensureClient` for the Live pack — official desktop build. */
export function pokemonDesktopClient(
  packId: string,
): (opts?: ProviderClientOpts) => Promise<ProviderClientOutcome> {
  return async (opts = {}) => {
    const log = opts.onLog ?? (() => {});
    const res = await httpGet<unknown>(POKEMON_UPDATER_MANIFEST_URL, {
      responseType: "json",
      timeout: 30_000,
      signal: opts.signal,
    });
    const latest = parseUpdaterManifest(res.data);
    if (!latest) {
      return {
        status: "unavailable",
        reason: `updater manifest unreadable (${POKEMON_UPDATER_MANIFEST_URL})`,
      };
    }
    const version = latest.md5.slice(0, 12);
    const stagingDir = packStagingDir(packId);
    const meta = readDesktopClientMeta(packId);
    const now = new Date().toISOString();
    if (
      !desktopClientNeedsDownload(meta, latest, {
        hasData: pokemonClientDataDir(stagingDir) != null,
        force: opts.force,
      })
    ) {
      writeDesktopClientMeta(packId, { ...meta!, checkedAt: now });
      return { status: "up-to-date", version };
    }

    const clientDir = path.join(stagingDir, CLIENT_DIR);
    const zipPath = path.join(clientDir, "Contents.zip");
    log(`client desktop ← ${latest.url}`);
    await downloadArchive(latest.url, zipPath, opts.signal);
    const md5 = await md5OfFile(zipPath);
    if (md5 !== latest.md5) {
      rmSync(zipPath, { force: true });
      return {
        status: "unavailable",
        reason: `client archive MD5 mismatch (got ${md5}, manifest ${latest.md5})`,
      };
    }
    log("client desktop : MD5 ok — dépaquetage Data/");
    await unpackData(zipPath, clientDir);
    rmSync(zipPath, { force: true });
    writeDesktopClientMeta(packId, {
      md5: latest.md5,
      url: latest.url,
      fetchedAt: now,
      checkedAt: now,
    });
    return { status: "updated", version };
  };
}
