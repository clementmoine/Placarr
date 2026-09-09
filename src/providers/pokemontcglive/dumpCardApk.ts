/**
 * Node dump of Live card UV rect + card back (ADR-021 phase D).
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { dumpCardBackFromDataDir, dumpCardBackWebp } from "@/lib/unity/cardBack";
import { loadUvRectFromJson } from "@/lib/unity/cardCrop";
import {
  cardQuadFromExtractedData,
  type CardQuadPayload,
} from "@/lib/unity/cardQuad";
import { openApkUnityData } from "@/lib/unity/apkAssets";
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

function loadExistingQuad(uvRectPath: string): CardQuadPayload | null {
  try {
    const parsed = JSON.parse(readFileSync(uvRectPath, "utf8")) as CardQuadPayload;
    if (!parsed?.uvRect || typeof parsed.aspect !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
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
  const apkMtime = existsSync(apk) ? statSync(apk).mtimeMs : null;
  const uvFresh =
    !opts.force &&
    apkMtime != null &&
    existsSync(uvRectPath) &&
    statSync(uvRectPath).mtimeMs >= apkMtime;
  const backFresh =
    !opts.force &&
    apkMtime != null &&
    existsSync(cardBackPath) &&
    statSync(cardBackPath).mtimeMs >= apkMtime;

  if (uvFresh && backFresh) {
    const quad = loadExistingQuad(uvRectPath);
    console.log("  card quad + back already newer than base.apk — skip APK scan");
    return {
      ok: quad != null,
      cardQuad: quad,
      uvRectPath,
      cardBackPath,
      cardBackOk: true,
      skipped: true,
    };
  }

  if (!existsSync(apk)) {
    const quad = loadExistingQuad(uvRectPath);
    console.log("  card quad ← no base.apk — reuse disk artifacts if present");
    return {
      ok: quad != null,
      cardQuad: quad,
      uvRectPath: existsSync(uvRectPath) ? uvRectPath : null,
      cardBackPath,
      cardBackOk: existsSync(cardBackPath),
      skipped: true,
    };
  }

  let extracted: ReturnType<typeof openApkUnityData> | null = null;
  try {
    let quad: CardQuadPayload | null = loadExistingQuad(uvRectPath);
    if (uvFresh && quad) {
      console.log("  card quad already newer than base.apk — skip mesh scan");
    } else {
      console.log(`  unzip APK Unity Data ← ${path.basename(apk)}…`);
      const unzipStarted = Date.now();
      extracted = openApkUnityData(apk);
      console.log(
        `  unzip done (${Math.round((Date.now() - unzipStarted) / 1000)}s)`,
      );
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
      console.log("  card back already newer than base.apk — skip dump");
      cardBackOk = true;
    } else {
      console.log("  card back ← dump…");
      const backStarted = Date.now();
      cardBackOk = extracted
        ? await dumpCardBackFromDataDir(extracted.dataDir, cardBackPath, cropRect)
        : await dumpCardBackWebp(apk, cardBackPath, cropRect);
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
