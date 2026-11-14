/**
 * Vitest-only foil meta FS backend.
 *
 * Same disk reader/writer as `foilMetaLoad.server`, but **without** importing
 * `lorcanatcg/indexStore` (that module pulls `httpClient` → `axios`). An eager
 * import from `setupFiles` would preload axios before test-file `vi.mock("axios")`
 * can apply, and every scrape test would hit the network.
 *
 * Lorcana `cards-index.json` is read from disk like any other foil meta file.
 * App/worker entrypoints keep using `@/lib/foilMetaLoad.server` (DB export).
 */

import fs from "node:fs";
import path from "node:path";

import {
  installPokemonShaderStemScanner,
  invalidatePokemonFoilNamesCache,
} from "@/effects/pokemon/foilNames";
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
