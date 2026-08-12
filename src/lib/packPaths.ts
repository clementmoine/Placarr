/**
 * Pack data layout helpers — catalogue (`cards/`), render (`foil/`), staging.
 * Public URLs: `/assets/<pack>/…` (cards + foil kit) — see {@link ./packAssetUrls}.
 *
 * Disk path helpers use `node:path` — **server/scripts only**. Client code must
 * import URL helpers from `packAssetUrls` (FoilCardImage / effects graph).
 */

import path from "node:path";

import { dataRoot, foilDataRoot, foilPackDir } from "./runtimeData";

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

export function packLogsDir(pack: string): string {
  return path.join(dataRoot(), pack, "logs");
}

export function packCatalogDb(pack: string): string {
  return path.join(dataRoot(), pack, "catalog.sqlite");
}

export function packCardsIndexPath(pack: string): string {
  return path.join(dataRoot(), pack, "cards-index.json");
}

export function packBackPath(pack: string): string {
  return path.join(packCardsDir(pack), "back.webp");
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
 * Resolve a `/assets/<pack>/…` path segments (after pack) to an absolute file
 * under cards/ or foil/.
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
