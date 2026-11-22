/**
 * Standalone Fusion World client staging: GUS → Xsolla CDN volumes → 7z extract
 * under `data/dragonball/fw/staging/xsolla/`. No Mac install required.
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";

import { httpGet } from "@/lib/http/httpClient";
import { packStagingDir } from "@/lib/packPaths";
import { DBS_FW_PACK_ID } from "@/providers/dragonball/dbsfw/indexStore";
import {
  DBS_FW_CDN_ORIGIN,
  DBS_FW_CDN_ORIGIN_FALLBACK,
  fetchGusManifest,
  type GusManifest,
} from "@/providers/dragonball/dbsfw/cdn/gus";
import { requireSevenZipBinary } from "@/providers/dragonball/dbsfw/cdn/sevenZip";

/** Which foil-kit steps finished for this client version. */
export type FwFoilKitStamp = {
  shadersOk?: boolean;
  texturesOk?: boolean;
  masksOk?: boolean;
  facesOk?: boolean;
  /**
   * Recette de rendu des faces (`CLIENT_FACE_BAKE_ID`) au moment où
   * `facesOk` a été posé : une nouvelle recette refait les faces même sans
   * changement de version du client.
   */
  facesRecipe?: string;
  updatedAt?: string;
};

export type FwClientStamp = {
  version: string;
  buildId: string;
  stem: string;
  volumeCount: number;
  fetchedAt: string;
  /** Cleared whenever the CDN client version/build changes. */
  kit?: FwFoilKitStamp;
};

export type EnsureFwClientOpts = {
  force?: boolean;
  repo?: string;
  stagingRoot?: string;
  /** Skip download when stamp matches (default true). */
  reuse?: boolean;
};

export type EnsureFwClientResult = {
  bundlesDir: string;
  gameRoot: string;
  stamp: FwClientStamp;
  downloaded: boolean;
  extracted: boolean;
  skipped: boolean;
};

const STANDALONE_REL = join(
  "DBSCGFW.app/Contents/Resources/Data/StreamingAssets/aa/StandaloneOSX",
);

export function fwXsollaStagingRoot(packId: string = DBS_FW_PACK_ID): string {
  return join(packStagingDir(packId), "xsolla");
}

function stampPath(root: string): string {
  return join(root, "version.json");
}

function readStamp(root: string): FwClientStamp | null {
  try {
    return JSON.parse(readFileSync(stampPath(root), "utf8")) as FwClientStamp;
  } catch {
    return null;
  }
}

function writeStamp(root: string, stamp: FwClientStamp): void {
  writeFileSync(stampPath(root), `${JSON.stringify(stamp, null, 2)}\n`, "utf8");
}

export function readFwClientStamp(stagingRoot?: string): FwClientStamp | null {
  return readStamp(stagingRoot ?? fwXsollaStagingRoot());
}

/**
 * Merge foil-kit progress into the current CDN stamp (same version only).
 */
export function updateFwClientKit(
  patch: Omit<FwFoilKitStamp, "updatedAt">,
  stagingRoot?: string,
): FwClientStamp | null {
  const root = stagingRoot ?? fwXsollaStagingRoot();
  const existing = readStamp(root);
  if (!existing) return null;
  const next: FwClientStamp = {
    ...existing,
    kit: {
      ...existing.kit,
      ...patch,
      updatedAt: new Date().toISOString(),
    },
  };
  writeStamp(root, next);
  return next;
}

export type FwFoilKitStep = "shadersOk" | "texturesOk" | "masksOk" | "facesOk";

/**
 * True when Sync can skip a foil-kit step: same CDN stamp, step already ok,
 * no force / partial filter.
 */
export function foilKitStepFresh(
  stamp: FwClientStamp | null | undefined,
  step: FwFoilKitStep,
  opts: {
    force?: boolean;
    limit?: number;
    match?: string;
    /** Recette courante des faces ; différente du tampon ⇒ étape à refaire. */
    facesRecipe?: string;
  } = {},
): boolean {
  if (opts.force) return false;
  if (opts.limit != null || (opts.match != null && opts.match !== "")) {
    return false;
  }
  if (
    step === "facesOk" &&
    opts.facesRecipe !== undefined &&
    stamp?.kit?.facesRecipe !== opts.facesRecipe
  ) {
    return false;
  }
  return stamp?.kit?.[step] === true;
}

/** Volume CDN par flux vers `.partial` — lib/http (rejeu, circuit par host). */
async function downloadToFile(
  url: string,
  dest: string,
  expectedBytes: number,
): Promise<void> {
  if (existsSync(dest) && expectedBytes > 0) {
    const size = statSync(dest).size;
    if (size === expectedBytes) return;
  }
  const partial = `${dest}.partial`;
  const res = await httpGet<Readable>(url, {
    responseType: "stream",
    // Délai jusqu'aux en-têtes : un volume de plusieurs centaines de Mo
    // s'écoule ensuite à son rythme.
    timeout: 120_000,
  });
  mkdirSync(join(dest, ".."), { recursive: true });
  await pipeline(res.data, createWriteStream(partial));
  renameSync(partial, dest);
  if (expectedBytes > 0) {
    const size = statSync(dest).size;
    if (size !== expectedBytes) {
      throw new Error(
        `CDN size mismatch ${dest}: got ${size}, expected ${expectedBytes}`,
      );
    }
  }
}

function run7zExtract(
  sevenZip: string,
  firstVolume: string,
  outDir: string,
): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  // Multi-volume: pass .001 only; siblings must sit beside it.
  // Prefer Addressables tree to keep staging lean when the archive layout allows.
  return new Promise((resolve, reject) => {
    const args = [
      "x",
      "-y",
      `-o${outDir}`,
      firstVolume,
      // Full app — Addressables filter is best-effort (path may vary).
    ];
    const child = spawn(sevenZip, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (c: Buffer) => {
      err += c.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`7z extract failed (${code}): ${err.slice(0, 500)}`));
    });
  });
}

function findStandaloneOsx(gameRoot: string): string | null {
  const direct = join(gameRoot, STANDALONE_REL);
  if (existsSync(direct)) return direct;
  // Some extracts nest under `game/`.
  const nested = join(gameRoot, "game", STANDALONE_REL);
  if (existsSync(nested)) return nested;
  return null;
}

/**
 * Client déjà posé par l'étape commune `ensurePackClient` (ADR-026) : tampon
 * de version + racine Addressables, lus sur disque sans réseau. `null` tant
 * qu'aucune Sync n'a téléchargé le client.
 */
export function readStagedFusionWorldClient(
  stagingRoot: string = fwXsollaStagingRoot(),
): { bundlesDir: string; stamp: FwClientStamp } | null {
  const stamp = readFwClientStamp(stagingRoot);
  const bundlesDir = findStandaloneOsx(join(stagingRoot, "game"));
  return stamp && bundlesDir ? { bundlesDir, stamp } : null;
}

/**
 * Ensure StandaloneOSX Addressables exist under pack staging (CDN download).
 */
export async function ensureFusionWorldClientFromCdn(
  opts: EnsureFwClientOpts = {},
): Promise<EnsureFwClientResult> {
  const root = opts.stagingRoot ?? fwXsollaStagingRoot();
  const volumesDir = join(root, "volumes");
  const gameRoot = join(root, "game");
  const repo = opts.repo ?? process.cwd();
  const reuse = opts.reuse !== false;

  mkdirSync(volumesDir, { recursive: true });
  mkdirSync(gameRoot, { recursive: true });

  let manifest: GusManifest;
  try {
    manifest = await fetchGusManifest({
      cdnOrigin: DBS_FW_CDN_ORIGIN,
    });
  } catch (err) {
    console.warn(
      `── fw cdn : primary GUS/CDN failed (${err instanceof Error ? err.message : err}) — retry fallback origin`,
    );
    manifest = await fetchGusManifest({
      cdnOrigin: DBS_FW_CDN_ORIGIN_FALLBACK,
    });
  }

  const stamp: FwClientStamp = {
    version: manifest.version,
    buildId: manifest.buildId,
    stem: manifest.stem,
    volumeCount: manifest.volumes.length,
    fetchedAt: new Date().toISOString(),
  };

  const existing = readStamp(root);
  const bundlesDir = findStandaloneOsx(gameRoot);
  if (
    reuse &&
    !opts.force &&
    existing?.version === stamp.version &&
    existing.buildId === stamp.buildId &&
    bundlesDir
  ) {
    console.log(
      `── fw cdn : reuse staging v${stamp.version} build ${stamp.buildId}`,
    );
    return {
      bundlesDir,
      gameRoot,
      stamp: existing,
      downloaded: false,
      extracted: false,
      skipped: true,
    };
  }

  console.log(
    `── fw cdn : GUS v${manifest.version} build ${manifest.buildId} — ${manifest.volumes.length} volumes`,
  );
  let downloaded = false;
  for (const vol of manifest.volumes) {
    const dest = join(volumesDir, vol.fileName);
    const had = existsSync(dest) && statSync(dest).size === vol.bytes;
    await downloadToFile(vol.url, dest, vol.bytes);
    if (!had) downloaded = true;
    console.log(`   volume ${vol.fileName} (${vol.bytes} B)`);
  }

  const sevenZip = requireSevenZipBinary(repo);
  const firstPath = join(volumesDir, manifest.firstVolume.fileName);
  console.log(`── fw cdn : 7z extract → ${gameRoot}`);
  await run7zExtract(sevenZip, firstPath, gameRoot);

  const ready = findStandaloneOsx(gameRoot);
  if (!ready) {
    throw new Error(
      `CDN extract finished but StandaloneOSX missing under ${gameRoot}`,
    );
  }
  writeStamp(root, stamp);
  return {
    bundlesDir: ready,
    gameRoot,
    stamp,
    downloaded,
    extracted: true,
    skipped: false,
  };
}
