/**
 * Client-safe `/assets/…` URL helpers for pack faces (no `node:*`).
 * Disk joins stay in {@link ./packPaths}.
 */

import { parsePrintKey } from "@/core/identify/printKey";
import { printKeyItemSlug } from "@/lib/routing/slugs";

export const ASSETS_URL_PREFIX = "/assets";

/**
 * Legacy pack ids still present in stored `/assets/…` URLs (sealed index,
 * older harvests). Disk + new URLs use the canonical id on the right.
 * Keep in sync with {@link ../packPaths} `PACK_DISK_ALIASES`.
 */
export const ASSET_PACK_ALIASES: Readonly<Record<string, string>> = {
  "dbs/jcc": "dragonball/jcc",
  "naruto/ccg": "naruto/carddass",
  "naruto/en-ccg": "naruto/carddass",
};

/** Live stem ``me5_fr_045`` / ``swsh10-5_fr_011`` (keep in sync with malie). */
const BUNDLE_STEM_RE = /^([a-z0-9.-]+)_([a-z]{2,4})_(\d{3})(?:_[a-z]+)?$/i;

export type CardDiskId = { set: string; lang: string; card: string };

/** Canonical pack id for `/assets/<pack>/…` (aliases → current disk tree). */
export function canonicalAssetPack(pack: string): string {
  const id = pack.trim();
  return ASSET_PACK_ALIASES[id] ?? id;
}

/** Live disk layout + face-file aliases — only this corpus needs EN/mask fallbacks. */
export function isPokemonAssetPack(pack: string): boolean {
  const id = canonicalAssetPack(pack);
  return id === "pokemon" || id.startsWith("pokemon/");
}

/**
 * Rewrite a stored `/assets/<legacy-pack>/…` URL onto the canonical pack tree.
 * Non-asset strings pass through unchanged.
 */
export function rewriteAssetPackUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith(`${ASSETS_URL_PREFIX}/`)) return trimmed;
  const rest = trimmed.slice(ASSETS_URL_PREFIX.length + 1);
  for (const [from, to] of Object.entries(ASSET_PACK_ALIASES)) {
    if (rest === from || rest.startsWith(`${from}/`)) {
      return `${ASSETS_URL_PREFIX}/${to}${rest.slice(from.length)}`;
    }
  }
  return trimmed;
}

export function assetsPackBase(pack: string): string {
  return `${ASSETS_URL_PREFIX}/${canonicalAssetPack(pack)}`;
}

export function assetsCardUrl(
  pack: string,
  id: CardDiskId,
  file: string,
): string {
  const parts = [id.lang, id.set, id.card, file].map((p) =>
    encodeURIComponent(p),
  );
  return `${assetsPackBase(pack)}/cards/${parts.join("/")}`;
}

/** Roles served by the print HTTP resolver (no basename in the URL). */
export type AssetsPrintRole = "face" | "thumb" | "face-b";

/**
 * Asset stem = shelf item slug without finish (`s1-cl0001-fr-normal` →
 * `s1-cl0001-fr`). Same builder as {@link printKeyItemSlug}.
 */
export function printKeyAssetStem(
  printKey: string,
  lang: string,
): string | null {
  const code = lang.trim().toLowerCase() || "fr";
  const stem = printKeyItemSlug(printKey, null, code);
  return stem || null;
}

/**
 * Print-scoped face URL — same stem as the shelf item URL.
 * `/assets/<pack>/prints/{set}-{id}-{lang}/face` (ex. `…/prints/s1-cl0001-fr/thumb`).
 * Never embeds `art.carddass.jpg` — ranking lives on disk (`face.json`).
 */
export function assetsPrintFaceUrl(
  pack: string,
  printKey: string,
  lang: string,
  role: AssetsPrintRole = "face",
): string {
  const code = lang.trim().toLowerCase() || "fr";
  const stem = printKeyAssetStem(printKey, code);
  if (stem) {
    return `${assetsPackBase(pack)}/prints/${encodeURIComponent(stem)}/${role}`;
  }
  // Unparseable — keep a resolvable legacy shape.
  const id = parsePrintKey(printKey);
  if (id) {
    const card = id.grouping ? `${id.number}-${id.grouping}` : id.number;
    return `${assetsPackBase(pack)}/prints/${encodeURIComponent(code)}/${encodeURIComponent(id.set)}/${encodeURIComponent(card)}/${role}`;
  }
  const colon = printKey.indexOf(":");
  const slug = (colon >= 0 ? printKey.slice(colon + 1) : printKey).trim();
  return `${assetsPackBase(pack)}/prints/${encodeURIComponent(code)}/${encodeURIComponent(slug)}/${role}`;
}

/**
 * Pack sleeve role URL — HTTP picks `back.{lang}.*` / `back.*`.
 * `/assets/<pack>/backs/{lang}`
 */
export function assetsPackBackRoleUrl(pack: string, lang: string): string {
  const code = lang.trim().toLowerCase() || "fr";
  return `${assetsPackBase(pack)}/backs/${encodeURIComponent(code)}`;
}

/**
 * Set verso role URL — HTTP picks under `cards/{lang}/{set}/back.*`.
 * `/assets/<pack>/backs/{lang}/sets/{set}`
 */
export function assetsSetBackRoleUrl(
  pack: string,
  set: string,
  lang: string,
): string {
  const code = lang.trim().toLowerCase() || "fr";
  const setId = set.trim().toLowerCase();
  return `${assetsPackBase(pack)}/backs/${encodeURIComponent(code)}/sets/${encodeURIComponent(setId)}`;
}

/**
 * Tier sleeve role URL — HTTP picks `cards/back.{tier}.*`.
 * `/assets/<pack>/backs/{lang}/tiers/{tier}` (`lang` is ignored for lookup).
 */
export function assetsPackTierBackRoleUrl(
  pack: string,
  tierSlug: string,
  lang = "en",
): string {
  const code = lang.trim().toLowerCase() || "en";
  const tier = tierSlug.trim().toLowerCase();
  return `${assetsPackBase(pack)}/backs/${encodeURIComponent(code)}/tiers/${encodeURIComponent(tier)}`;
}

export function assetsPackFileUrl(pack: string, ...segments: string[]): string {
  return `${assetsPackBase(pack)}/${segments.map((s) => encodeURIComponent(s)).join("/")}`;
}

/** Roles served for sealed SKUs — basename stays on disk (`face.json` + `art.*`). */
export type AssetsSealedProductRole = "face" | "thumb" | "back" | "logo";

/**
 * Sealed packshot role URL — no filename in the public path.
 * `/assets/<pack>/products/{slug}/{lang}/face` (also `thumb` / `back` / `logo`).
 */
export function assetsSealedProductRoleUrl(
  pack: string,
  slug: string,
  lang: string,
  role: AssetsSealedProductRole = "face",
): string {
  const code = lang.trim().toLowerCase() || "fr";
  const id = slug.trim();
  return `${assetsPackBase(pack)}/products/${encodeURIComponent(id)}/${encodeURIComponent(code)}/${role}`;
}

/** Lorcana printKey → set + card folder (`20-p1` when grouping). */
export function cardDiskIdFromPrintKey(
  printKey: string,
  lang: string,
): CardDiskId | null {
  const id = parsePrintKey(printKey);
  if (!id) return null;
  const card = id.grouping ? `${id.number}-${id.grouping}` : id.number;
  return { set: id.set, lang: lang.toLowerCase(), card };
}

/**
 * Rewrite `/assets/…/cards/{lang}/{set}/{card}/…` when a printKey remap
 * moves the home folder (art letter, home set, grouping).
 */
export function rewriteAssetUrlForPrintKeyChange(
  url: string | null | undefined,
  fromKey: string,
  toKey: string,
  langHint?: string | null,
): string | null | undefined {
  if (!url) return url;
  const langMatch = /\/cards\/([^/]+)\//i.exec(url);
  const lang = (langMatch?.[1] ?? langHint ?? "fr").toLowerCase();
  const from = cardDiskIdFromPrintKey(fromKey, lang);
  const to = cardDiskIdFromPrintKey(toKey, lang);
  if (!from || !to) return url;
  if (
    from.set === to.set &&
    from.lang === to.lang &&
    from.card === to.card
  ) {
    return url;
  }
  const needle = `/cards/${from.lang}/${from.set}/${from.card}/`;
  const next = `/cards/${to.lang}/${to.set}/${to.card}/`;
  return url.includes(needle) ? url.replace(needle, next) : url;
}

/** Live bundle stem `me5_fr_045` → set/lang/card. */
export function cardDiskIdFromBundleStem(stem: string): CardDiskId | null {
  const m = BUNDLE_STEM_RE.exec(stem.trim());
  if (!m) return null;
  return {
    set: m[1]!.toLowerCase(),
    lang: m[2]!.toLowerCase(),
    card: m[3]!,
  };
}

/**
 * Live Texture2D stem → canonical face filename under
 * `cards/{lang}/{set}/{card}/`.
 */
export function pokemonFaceFileFromTex(
  bundleStem: string,
  texStem: string,
  /**
   * What the caller knows this texture is for.
   *
   * The spelling alone cannot say: promo `bsp` sets name their foil layer
   * `<set>_foil_<lang>_<num>` with no `_wp_`, and the same bundle can carry a
   * stray `_foil_` texture no variant claims. Told it is a mask, an
   * unrecognised stem resolves to `mask.webp` instead of falling through to
   * `art.webp` — which had 67 cards asking for their own artwork as a foil
   * mask. Mirrors `as_mask` in `unity/extract.py`.
   */
  role: "art" | "mask" = "art",
): string {
  const base = texStem
    .trim()
    .replace(/\.(webp|png)$/i, "")
    .toLowerCase();
  const stem = bundleStem.trim().toLowerCase();
  if (!base || base === stem) return "art.webp";
  if (base.includes("_etch_")) return "etch.webp";
  if (base.includes("_wp_mph_")) return "mask-mph.webp";
  if (base.includes("_wp_sph_")) return "mask-sph.webp";
  if (base.includes("_wp_ph_")) return "mask-ph.webp";
  if (base.includes("_wp_")) return "mask.webp";
  return role === "mask" ? "mask.webp" : "art.webp";
}

/** `/assets/pokemon/cards/{lang}/{set}/{num}/{art|mask|…}.webp` */
export function pokemonCardTextureUrl(
  bundleStem: string,
  texStem: string | null | undefined,
  role: "art" | "mask" = "art",
): string | null {
  const tex = texStem?.trim();
  if (!tex) return null;
  const id = cardDiskIdFromBundleStem(bundleStem);
  if (!id) return null;
  return assetsCardUrl(
    "pokemon",
    id,
    pokemonFaceFileFromTex(bundleStem, tex, role),
  );
}
