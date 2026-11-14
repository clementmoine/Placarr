/**
 * Skip re-extract of shadersbundle when foil outputs are already newer.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

function listFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(ext))
    .map((name) => path.join(dir, name));
}

/** Shaders + shared textures + material sheets not older than `shadersbundle`. */
export function pokemonShadersDumpFresh(
  packDir: string,
  shadersBundlePath: string,
): boolean {
  if (!existsSync(shadersBundlePath)) return false;
  const sheets = path.join(packDir, "materialSheets.json");
  const motifs = path.join(packDir, "shared-motifs.json");
  const frags = listFiles(path.join(packDir, "shaders"), ".frag");
  const textures = listFiles(path.join(packDir, "textures"), ".webp");
  if (!existsSync(sheets) || !existsSync(motifs)) return false;
  if (!frags.length || !textures.length) return false;
  const bundleMtime = statSync(shadersBundlePath).mtimeMs;
  const oldest = Math.min(
    statSync(sheets).mtimeMs,
    statSync(motifs).mtimeMs,
    ...frags.map((file) => statSync(file).mtimeMs),
    ...textures.map((file) => statSync(file).mtimeMs),
  );
  return oldest >= bundleMtime;
}
