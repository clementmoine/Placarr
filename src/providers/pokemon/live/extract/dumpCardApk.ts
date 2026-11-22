/**
 * Node dump of Live card UV rect + card back (ADR-021 phase D).
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { dumpCardBackFromDataDir } from "@/lib/unity/cardBack";
import { loadUvRectFromJson } from "@/core/render/unity/cardCrop";
import {
  cardQuadFromExtractedData,
  type CardQuadPayload,
} from "@/lib/unity/cardQuad";
import { openApkUnityData, type ExtractedApkData } from "@/lib/unity/apkAssets";
import { pokemonClientDataDir } from "@/providers/pokemon/live/cdn/desktopClient";
import {
  foilPackDir,
  packCardsDir,
  packStagingDir,
} from "@/providers/shared/foilPaths";

export type DumpCardApkOpts = {
  repo: string;
  pack?: string;
  force?: boolean;
};

export type DumpCardApkResult = {
  ok: boolean;
  cardQuad: CardQuadPayload | null;
  uvRectPath: string | null;
  cardBackPath: string | null;
  cardBackOk: boolean;
  skipped?: boolean;
};

/** UV + back already on disk and not older than `base.apk`. */
export function pokemonApkDumpFresh(opts: {
  apkPath: string;
  uvRectPath: string;
  cardBackPath: string;
}): boolean {
  if (
    !existsSync(opts.apkPath) ||
    !existsSync(opts.uvRectPath) ||
    !existsSync(opts.cardBackPath)
  ) {
    return false;
  }
  const apkMtime = statSync(opts.apkPath).mtimeMs;
  return (
    statSync(opts.uvRectPath).mtimeMs >= apkMtime &&
    statSync(opts.cardBackPath).mtimeMs >= apkMtime
  );
}

export type PokemonClientSource =
  | { kind: "apk"; apkPath: string; mtimeMs: number }
  | { kind: "desktop"; dataDir: string; mtimeMs: number };

/**
 * Unity data to read the Card mesh + card back from: a pulled / store
 * `base.apk`, else the official desktop client the Sync unpacks
 * (`desktopClient.ts`). Same `Data/` content either way.
 */
export function resolvePokemonClientSource(input: {
  apkPath: string;
  stagingDir: string;
}): PokemonClientSource | null {
  if (existsSync(input.apkPath)) {
    return {
      kind: "apk",
      apkPath: input.apkPath,
      mtimeMs: statSync(input.apkPath).mtimeMs,
    };
  }
  const dataDir = pokemonClientDataDir(input.stagingDir);
  if (dataDir) {
    return { kind: "desktop", dataDir, mtimeMs: statSync(dataDir).mtimeMs };
  }
  return null;
}

function loadExistingQuad(uvRectPath: string): CardQuadPayload | null {
  try {
    const parsed = JSON.parse(readFileSync(uvRectPath, "utf8")) as CardQuadPayload;
    if (!parsed?.uvRect || typeof parsed.aspect !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Unity `Data/` of the game client: unzipped APK, or the desktop dir as-is. */
function openClientData(source: PokemonClientSource): ExtractedApkData {
  if (source.kind === "desktop") {
    console.log(`  Unity Data ← client desktop ${source.dataDir}`);
    return { tmpDir: "", dataDir: source.dataDir, cleanup: () => {} };
  }
  console.log(`  unzip APK Unity Data ← ${path.basename(source.apkPath)}…`);
  const unzipStarted = Date.now();
  const extracted = openApkUnityData(source.apkPath);
  console.log(
    `  unzip done (${Math.round((Date.now() - unzipStarted) / 1000)}s)`,
  );
  return extracted;
}

export async function dumpPokemonCardApk(
  opts: DumpCardApkOpts,
): Promise<DumpCardApkResult> {
  const pack = opts.pack ?? "pokemon";
  const apk = path.join(packStagingDir(opts.repo, pack), "apks", "base.apk");
  const foilDir = foilPackDir(opts.repo, pack);
  const cardsDir = packCardsDir(opts.repo, pack);
  mkdirSync(foilDir, { recursive: true });
  mkdirSync(cardsDir, { recursive: true });

  const uvRectPath = path.join(foilDir, "card-uv-rect.json");
  const cardBackPath = path.join(cardsDir, "back.webp");
  const source = resolvePokemonClientSource({
    apkPath: apk,
    stagingDir: packStagingDir(opts.repo, pack),
  });
  const clientMtime = source?.mtimeMs ?? null;
  const uvFresh =
    !opts.force &&
    clientMtime != null &&
    existsSync(uvRectPath) &&
    statSync(uvRectPath).mtimeMs >= clientMtime;
  const backFresh =
    !opts.force &&
    clientMtime != null &&
    existsSync(cardBackPath) &&
    statSync(cardBackPath).mtimeMs >= clientMtime;

  if (uvFresh && backFresh) {
    const quad = loadExistingQuad(uvRectPath);
    console.log(
      "  card quad + back already newer than the game client — skip scan",
    );
    return {
      ok: quad != null,
      cardQuad: quad,
      uvRectPath,
      cardBackPath,
      cardBackOk: quad != null ? existsSync(cardBackPath) : false,
      skipped: true,
    };
  }

  if (!source) {
    const quad = loadExistingQuad(uvRectPath);
    console.log(
      "  card quad ← no game client (APK / desktop) — reuse disk artifacts if present",
    );
    return {
      ok: quad != null,
      cardQuad: quad,
      uvRectPath: existsSync(uvRectPath) ? uvRectPath : null,
      cardBackPath,
      cardBackOk: existsSync(cardBackPath),
      skipped: true,
    };
  }

  let extracted: ExtractedApkData | null = null;
  try {
    let quad: CardQuadPayload | null = loadExistingQuad(uvRectPath);
    if (uvFresh && quad) {
      console.log(
        "  card quad already newer than the game client — skip mesh scan",
      );
    } else {
      extracted = openClientData(source);
      console.log("  card quad ← scan serialized heads…");
      const quadStarted = Date.now();
      quad = await cardQuadFromExtractedData(extracted);
      console.log(
        `  card quad ${quad ? "ok" : "MISS"} (${Math.round((Date.now() - quadStarted) / 1000)}s)`,
      );
      if (quad) {
        writeFileSync(uvRectPath, `${JSON.stringify(quad, null, 2)}\n`, "utf8");
      }
    }

    const cropRect = quad ? loadUvRectFromJson(quad) : null;
    let cardBackOk = existsSync(cardBackPath);
    if (backFresh) {
      console.log("  card back already newer than the game client — skip dump");
      cardBackOk = existsSync(cardBackPath);
    } else if (cropRect == null) {
      // Refuse to write a non-cropped (uncropped atlas) card back: without a
      // valid UV rect the dump would ship an atlas slice as the card back.
      console.log("  card back skipped — no UV rect (cardQuad MISS)");
      cardBackOk = existsSync(cardBackPath);
    } else {
      console.log("  card back ← dump…");
      const backStarted = Date.now();
      extracted ??= openClientData(source);
      cardBackOk = await dumpCardBackFromDataDir(
        extracted.dataDir,
        cardBackPath,
        cropRect,
      );
      console.log(
        `  card back ${cardBackOk ? "ok" : "MISS"} (${Math.round((Date.now() - backStarted) / 1000)}s)`,
      );
    }

    return {
      ok: quad != null,
      cardQuad: quad,
      uvRectPath: quad ? uvRectPath : null,
      cardBackPath,
      cardBackOk,
    };
  } finally {
    extracted?.cleanup();
  }
}
