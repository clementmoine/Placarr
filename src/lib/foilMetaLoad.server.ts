/**
 * Server/scripts filesystem backend for {@link foilMetaLoad}.
 * Import this module once on any Node entry (API, worker, provider, CLI).
 *
 * No `server-only` — workers/scripts use tsx outside Next's RSC resolver
 * (same rationale as `cardFoilIndex`).
 */

import fs from "node:fs";
import path from "node:path";

import { installPokemonShaderStemScanner, invalidatePokemonFoilNamesCache } from "@/effects/pokemon/foilNames";
import {
  installFoilMetaFileReader,
  installFoilMetaFileWriter,
} from "@/lib/foilMetaLoad";
import { packShadersDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";

function absPath(relativeUnderData: string): string {
  return path.join(dataRoot(), ...relativeUnderData.split("/").filter(Boolean));
}

installFoilMetaFileReader((relativeUnderData, fallback) => {
  const filePath = absPath(relativeUnderData);
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as typeof fallback;
  } catch {
    return fallback;
  }
});

installFoilMetaFileWriter((relativeUnderData, value) => {
  const filePath = absPath(relativeUnderData);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
});

installPokemonShaderStemScanner(() => {
  const dir = packShadersDir("pokemon");
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((n) => n.endsWith(".frag"))
      .map((n) => n.replace(/\.frag$/i, ""));
  } catch {
    return [];
  }
});

invalidatePokemonFoilNamesCache();

export {
  FOIL_META_KEYS,
  hydrateFoilMetaFromAssets,
  loadCardsIndexJson,
  loadFoilManifest,
  loadFragStems,
  loadLiveFoilMasks,
  loadLiveOwned,
  loadMaterialSheets,
  loadReprintMeta,
  loadSharedMotifs,
  loadTextureFlags,
  readDataJsonSync,
  resetFoilMetaCache,
  writeDataJsonSync,
} from "@/lib/foilMetaLoad";
