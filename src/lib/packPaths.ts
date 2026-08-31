/**
 * Pack data layout helpers — catalogue (`cards/`), render (`foil/`), staging.
 * Public URLs: `/assets/<pack>/…` (cards + products + foil kit) — see {@link ./packAssetUrls}.
 * Disk path helpers use `node:path` — **server/scripts only**. Client code must
 * import URL helpers from `packAssetUrls` (FoilCardImage / effects graph).
 */

import { existsSync, readdirSync } from "node:fs";
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

const BACK_EXTENSIONS = ["webp", "png", "jpg", "jpeg"] as const;

/**
 * Back filenames to try, most specific first.
 *
 * A print run can carry its own verso — Japanese Pokémon and Japanese Carddass
 * do not share the international back — while every Latin-script locale of the
 * same run shares one. So a language-qualified `back.<lang>.webp` wins when it
 * exists and everything else falls back to the common `back.webp`: no need to
 * duplicate one identical file per locale.
 */
export function backFilenameCandidates(lang?: string | null): string[] {
  const code = (lang ?? "").trim().toLowerCase();
  const names: string[] = [];
  if (/^[a-z]{2}([a-z]{2})?$/.test(code)) {
    for (const ext of BACK_EXTENSIONS) names.push(`back.${code}.${ext}`);
  }
  for (const ext of BACK_EXTENSIONS) names.push(`back.${ext}`);
  return names;
}

/** Old Carddass folder `naruto/ccg` still serves from `naruto/carddass`. */
const PACK_DISK_ALIASES: Readonly<Record<string, string>> = {
  "naruto/ccg": "naruto/carddass",
  "naruto/en-ccg": "naruto/carddass",
};

export function canonicalDataPack(pack: string): string {
  return PACK_DISK_ALIASES[pack] ?? pack;
}

export function packDataDir(pack: string): string {
  return path.join(dataRoot(), canonicalDataPack(pack));
}

/** Catalogue faces + backs — `data/<pack>/cards`. */
export function packCardsDir(pack: string): string {
  return path.join(foilDataRoot(), canonicalDataPack(pack), "cards");
}

/** Render kit — `data/<pack>/foil` (shaders, FX textures, web). */
export { foilPackDir };

export function packStagingDir(pack: string): string {
  return path.join(dataRoot(), canonicalDataPack(pack), "staging");
}

/** Uploaded / pulled APKs — `data/<pack>/staging/apks`. */
export function packApksDir(pack: string): string {
  return path.join(packStagingDir(pack), "apks");
}

/** Cached Unity Data extract — `data/<pack>/staging/unity-data`. */
export function packUnityDataDir(pack: string): string {
  return path.join(packStagingDir(pack), "unity-data");
}

/** Simey CSS trees — `data/<pack>/staging/simey` (volatile; not served). */
export type PokemonSimeyTreeId = "poke-holo" | "poke-151";

/** Staging Simey pour un pack (défaut Pokémon — seul consommateur aujourd'hui). */
export function packSimeyStagingDir(pack = "pokemon"): string {
  return path.join(packStagingDir(pack), "simey");
}

export function packSimeyTreeDir(
  tree: PokemonSimeyTreeId,
  pack = "pokemon",
): string {
  return path.join(packSimeyStagingDir(pack), tree);
}

/** CSS cards dir for gap audit — empty / missing when not synced. */
export function packSimeyCssCardsDir(
  tree: PokemonSimeyTreeId,
  pack = "pokemon",
): string {
  return path.join(packSimeyTreeDir(tree, pack), "public", "css", "cards");
}

/** @deprecated Prefer {@link packSimeyStagingDir}. */
export function pokemonSimeyStagingDir(): string {
  return packSimeyStagingDir("pokemon");
}

/** @deprecated Prefer {@link packSimeyTreeDir}. */
export function pokemonSimeyTreeDir(tree: PokemonSimeyTreeId): string {
  return packSimeyTreeDir(tree, "pokemon");
}

/** @deprecated Prefer {@link packSimeyCssCardsDir}. */
export function pokemonSimeyCssCardsDir(tree: PokemonSimeyTreeId): string {
  return packSimeyCssCardsDir(tree, "pokemon");
}

export function packLogsDir(pack: string): string {
  return path.join(dataRoot(), canonicalDataPack(pack), "logs");
}

export function packCatalogDb(pack: string): string {
  return path.join(dataRoot(), canonicalDataPack(pack), "catalog.sqlite");
}

export function packCardsIndexPath(pack: string): string {
  return path.join(dataRoot(), canonicalDataPack(pack), "cards-index.json");
}

/** Prints whose recto text is locale-specific — optional, per pack. */
export function packLocaleSpecificFacesPath(pack: string): string {
  return path.join(
    dataRoot(),
    canonicalDataPack(pack),
    "locale-specific-faces.json",
  );
}

/** Sealed SKUs — `data/<pack>/products-index.json`. */
export function packProductsIndexPath(pack: string): string {
  return path.join(dataRoot(), canonicalDataPack(pack), "products-index.json");
}

/** Local packshots — `data/<pack>/products/{slug}/{lang}/art.<source>.<ext>`. */
export function packSealedProductsDir(pack: string): string {
  return path.join(dataRoot(), canonicalDataPack(pack), "products");
}

/**
 * Absolute path to the pack default card back under `cards/`.
 * Prefers `back.webp` (Lorcana / Pokémon dump, Naruto curated install), then
 * `back.png` / jpeg legacy. Falls back to the webp path even if missing
 * (callers that write a back still have a canonical destination).
 */
export function packBackPath(pack: string): string {
  return (
    resolvePackBackPath(pack) ?? path.join(packCardsDir(pack), "back.webp")
  );
}

/** Disk path of an existing pack back, or `null` if none. */
export function resolvePackBackPath(
  pack: string,
  lang?: string | null,
): string | null {
  const dir = packCardsDir(pack);
  for (const name of backFilenameCandidates(lang)) {
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Optional set-specific verso under `cards/{set}/back.webp` (Naruto etc.).
 * Pack-common back stays at `cards/back.webp`.
 */
export function resolveSetBackPath(
  pack: string,
  set: string,
  lang?: string | null,
): string | null {
  const trimmed = set.trim();
  if (
    !trimmed ||
    trimmed.includes("..") ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  ) {
    return null;
  }
  const dir = path.join(packCardsDir(pack), trimmed);
  for (const name of backFilenameCandidates(lang)) {
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const PACK_TIER_BACK_FILE =
  /^back\.([a-z0-9][a-z0-9-]*)\.(webp|png|jpe?g)$/i;

/** `/assets/<pack>/cards/back.{webp|png|…}` when a back file exists. */
export function assetsPackBackUrl(
  pack: string,
  lang?: string | null,
): string | null {
  const disk = resolvePackBackPath(pack, lang);
  if (!disk) return null;
  return assetsPackFileUrl(pack, "cards", path.basename(disk));
}

/** Disk path for `cards/back.<tierSlug>.{webp|png|…}`. */
export function resolvePackTierBackPath(
  pack: string,
  tierSlug: string,
): string | null {
  const slug = tierSlug.trim().toLowerCase();
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;
  const dir = packCardsDir(pack);
  for (const ext of BACK_EXTENSIONS) {
    const candidate = path.join(dir, `back.${slug}.${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** `/assets/<pack>/cards/back.<tier>.webp` when installed. */
export function assetsPackTierBackUrl(
  pack: string,
  tierSlug: string,
): string | null {
  const disk = resolvePackTierBackPath(pack, tierSlug);
  if (!disk) return null;
  return assetsPackFileUrl(pack, "cards", path.basename(disk));
}

/** Slugs from `back.<slug>.webp` at pack cards root (tier / locale suffix). */
export function listPackTierBackSlugs(pack: string): string[] {
  const dir = packCardsDir(pack);
  if (!existsSync(dir)) return [];
  const slugs = new Set<string>();
  for (const name of readdirSync(dir)) {
    const m = PACK_TIER_BACK_FILE.exec(name);
    if (m) slugs.add(m[1]!.toLowerCase());
  }
  return [...slugs].sort((a, b) => a.localeCompare(b));
}

/** `/assets/<pack>/cards/{set}/back.{webp|png|…}` when a set verso exists. */
export function assetsSetBackUrl(
  pack: string,
  set: string,
  lang?: string | null,
): string | null {
  const disk = resolveSetBackPath(pack, set, lang);
  if (!disk) return null;
  return assetsPackFileUrl(pack, "cards", set, path.basename(disk));
}

/** Lorcana Unity materials manifest — `data/lorcana/foil/manifest.json`. */
export function packFoilManifestPath(pack: string): string {
  return path.join(foilPackDir(pack), "manifest.json");
}

/** Material float/color sheets — `data/<pack>/foil/materialSheets.json`. */
export function packMaterialSheetsPath(pack: string): string {
  return path.join(foilPackDir(pack), "materialSheets.json");
}

export function packTextureFlagsPath(pack: string): string {
  return path.join(foilPackDir(pack), "textureFlags.json");
}

export function packFragStemsPath(pack: string): string {
  return path.join(foilPackDir(pack), "frag-stems.json");
}

export function packSharedMotifsPath(pack: string): string {
  return path.join(foilPackDir(pack), "shared-motifs.json");
}

/** Client-safe Live foil_mask overrides (beside catalog). */
export function packLiveFoilMasksPath(pack: string): string {
  return path.join(dataRoot(), pack, "liveFoilMasks.json");
}

export function packLiveOwnedPath(pack: string): string {
  return path.join(dataRoot(), pack, "liveOwned.json");
}

export function packReprintMetaPath(pack: string): string {
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
 * Supports nested product lines: `/assets/naruto/carddass/cards/…`.
 */
/**
 * Segments that end a pack id and start its content.
 *
 * `cards` is the catalogue; everything else is the render kit, which the app
 * serves flat under the pack (`/assets/lorcana/web/…` → `data/lorcana/foil/web`)
 * — see {@link resolveAssetsDiskRoot}. Listing only `cards` and `foil` here made
 * every shader and web texture 404, since no client builds those URLs with a
 * `foil` segment.
 */
const PACK_ASSET_ROOTS = [
  "cards",
  "foil",
  "products",
  "web",
  "shaders",
  "textures",
] as const;

function isPackAssetRoot(segment: string | undefined): boolean {
  return Boolean(
    segment && (PACK_ASSET_ROOTS as readonly string[]).includes(segment),
  );
}

/** A plain filename with an extension — never a path, never a traversal. */
function isPackAssetFile(segment: string | undefined): boolean {
  return Boolean(segment && /^[a-z0-9_-]+\.[a-z0-9]+$/i.test(segment));
}

export function splitAssetsPackPath(
  segments: string[],
): { pack: string; rest: string[] } | null {
  if (segments.length < 2) return null;
  const segOk = (s: string) => /^[a-z0-9_-]+$/i.test(s);
  const [a, b, c] = segments;
  if (!a || !segOk(a)) return null;
  if (isPackAssetRoot(b)) {
    return { pack: a, rest: segments.slice(1) };
  }
  // Nested product line: `naruto/carddass/cards/…`, `naruto/carddass/shaders/…`.
  if (b && segOk(b) && isPackAssetRoot(c) && segments.length >= 3) {
    return { pack: `${a}/${b}`, rest: segments.slice(2) };
  }
  /*
    A loose file sitting at the root of `data/<pack>/foil/` — `full_foil_mask.
    webp` is the one that matters, and it is what every pack's
    `fallbackFoilMaskUrl` points at. Requiring a directory root here made those
    URLs 404, so the Pokémon fallback mask had never once been served.
    An extension is required so `naruto/carddass` stays a pack (not a file) and
    `lorcana/etc/passwd` stays rejected.
  */
  if (segments.length === 2 && isPackAssetFile(b)) {
    return { pack: a, rest: [b!] };
  }
  if (segments.length === 3 && b && segOk(b) && isPackAssetFile(c)) {
    return { pack: `${a}/${b}`, rest: [c!] };
  }
  return null;
}

/**
 * Resolve a `/assets/<pack>/…` path segments (after pack) to an absolute file
 * under cards/, products/, or foil/ (staging is never served).
 */
export function resolveAssetsDiskRoot(
  pack: string,
  rest: string[],
): { root: string; relative: string[] } | null {
  if (rest.length === 0) return null;
  const disk = canonicalDataPack(pack);
  if (rest[0] === "cards") {
    return { root: packCardsDir(disk), relative: rest.slice(1) };
  }
  if (rest[0] === "products") {
    return { root: packSealedProductsDir(disk), relative: rest.slice(1) };
  }
  return { root: foilPackDir(disk), relative: rest };
}
