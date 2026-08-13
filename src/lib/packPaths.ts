/**
 * Pack data layout helpers — catalogue (`cards/`), render (`foil/`), staging.
 * Public URLs: `/assets/<pack>/…` (cards + foil kit) — see {@link ./packAssetUrls}.
 * Disk path helpers use `node:path` — **server/scripts only**. Client code must
 * import URL helpers from `packAssetUrls` (FoilCardImage / effects graph).
 */

import { existsSync } from "node:fs";
import path from "node:path";

import { dataRoot, foilDataRoot, foilPackDir } from "./runtimeData";
import { assetsPackFileUrl } from "./packAssetUrls";

export {
  ASSETS_URL_PREFIX,
  assetsCardUrl,
  assetsPackBase,
  assetsPackFileUrl,
  cardDiskIdFromBundleStem,
  cardDiskIdFromPrintKey,
  pokemonCardTextureUrl,
  pokemonFaceFileFromTex,
  type CardDiskId,
} from "./packAssetUrls";

/** Preferred order when several pack backs exist on disk. */
export const PACK_BACK_FILENAMES = [
  "back.webp",
  "back.png",
  "back.jpg",
  "back.jpeg",
] as const;

export function packDataDir(pack: string): string {
  return path.join(dataRoot(), pack);
}

/** Catalogue faces + backs — `data/<pack>/cards`. */
export function packCardsDir(pack: string): string {
  return path.join(foilDataRoot(), pack, "cards");
}

/** Render kit — `data/<pack>/foil` (shaders, FX textures, web). */
export { foilPackDir };

export function packStagingDir(pack: string): string {
  return path.join(dataRoot(), pack, "staging");
}

/** Uploaded / pulled APKs — `data/<pack>/staging/apks`. */
export function packApksDir(pack: string): string {
  return path.join(packStagingDir(pack), "apks");
}

/** Cached Unity Data extract — `data/<pack>/staging/unity-data`. */
export function packUnityDataDir(pack: string): string {
  return path.join(packStagingDir(pack), "unity-data");
}

/** Simey CSS trees — `data/pokemon/staging/simey` (volatile; not served). */
export type PokemonSimeyTreeId = "poke-holo" | "poke-151";

export function pokemonSimeyStagingDir(): string {
  return path.join(packStagingDir("pokemon"), "simey");
}

export function pokemonSimeyTreeDir(tree: PokemonSimeyTreeId): string {
  return path.join(pokemonSimeyStagingDir(), tree);
}

/** CSS cards dir for gap audit — empty / missing when not synced. */
export function pokemonSimeyCssCardsDir(tree: PokemonSimeyTreeId): string {
  return path.join(pokemonSimeyTreeDir(tree), "public", "css", "cards");
}

export function packLogsDir(pack: string): string {
  return path.join(dataRoot(), pack, "logs");
}

export function packCatalogDb(pack: string): string {
  return path.join(dataRoot(), pack, "catalog.sqlite");
}

export function packCardsIndexPath(pack: string): string {
  return path.join(dataRoot(), pack, "cards-index.json");
}

/**
 * Absolute path to the pack default card back under `cards/`.
 * Prefers `back.webp` (Lorcana / Pokémon dump, Naruto curated install), then
 * `back.png` / jpeg legacy. Falls back to the webp path even if missing
 * (callers that write a back still have a canonical destination).
 */
export function packBackPath(pack: string): string {
  return resolvePackBackPath(pack) ?? path.join(packCardsDir(pack), "back.webp");
}

/** Disk path of an existing pack back, or `null` if none. */
export function resolvePackBackPath(pack: string): string | null {
  const dir = packCardsDir(pack);
  for (const name of PACK_BACK_FILENAMES) {
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** `/assets/<pack>/cards/back.{webp|png|…}` when a back file exists. */
export function assetsPackBackUrl(pack: string): string | null {
  const disk = resolvePackBackPath(pack);
  if (!disk) return null;
  return assetsPackFileUrl(pack, "cards", path.basename(disk));
}

/** Lorcana Unity materials manifest — `data/lorcana/foil/manifest.json`. */
export function packFoilManifestPath(pack: string): string {
  return path.join(foilPackDir(pack), "manifest.json");
}

/** Pokémon Live material float/color sheets. */
export function packMaterialSheetsPath(pack = "pokemon"): string {
  return path.join(foilPackDir(pack), "materialSheets.json");
}

export function packTextureFlagsPath(pack = "pokemon"): string {
  return path.join(foilPackDir(pack), "textureFlags.json");
}

export function packFragStemsPath(pack = "pokemon"): string {
  return path.join(foilPackDir(pack), "frag-stems.json");
}

export function packSharedMotifsPath(pack = "pokemon"): string {
  return path.join(foilPackDir(pack), "shared-motifs.json");
}

/** Client-safe Live foil_mask overrides (beside catalog). */
export function packLiveFoilMasksPath(pack = "pokemon"): string {
  return path.join(dataRoot(), pack, "liveFoilMasks.json");
}

export function packLiveOwnedPath(pack = "pokemon"): string {
  return path.join(dataRoot(), pack, "liveOwned.json");
}

export function packReprintMetaPath(pack = "pokemon"): string {
  return path.join(dataRoot(), pack, "reprintMeta.json");
}

export function packShadersDir(pack: string): string {
  return path.join(foilPackDir(pack), "shaders");
}

/** Disk folder for one print locale: `cards/{set}/{lang}/{card}`. */
export function packCardDir(
  pack: string,
  id: { set: string; lang: string; card: string },
): string {
  return path.join(packCardsDir(pack), id.set, id.lang, id.card);
}

/**
 * Resolve a `/assets/<pack>/…` path segments (after host) to pack id + rest.
 * Supports nested product lines: `/assets/naruto/ccg/cards/…`.
 */
export function splitAssetsPackPath(
  segments: string[],
): { pack: string; rest: string[] } | null {
  if (segments.length < 2) return null;
  const segOk = (s: string) => /^[a-z0-9_-]+$/i.test(s);
  const [a, b, c] = segments;
  if (!a || !segOk(a)) return null;
  if (b === "cards" || b === "foil") {
    return { pack: a, rest: segments.slice(1) };
  }
  if (b && segOk(b) && (c === "cards" || c === "foil") && segments.length >= 3) {
    return { pack: `${a}/${b}`, rest: segments.slice(2) };
  }
  return null;
}

/**
 * Resolve a `/assets/<pack>/…` path segments (after pack) to an absolute file
 * under cards/ or foil/ (staging is never served).
 */
export function resolveAssetsDiskRoot(
  pack: string,
  rest: string[],
): { root: string; relative: string[] } | null {
  if (rest.length === 0) return null;
  if (rest[0] === "cards") {
    return { root: packCardsDir(pack), relative: rest.slice(1) };
  }
  return { root: foilPackDir(pack), relative: rest };
}
