/**
 * Client-safe `/assets/…` URL helpers for pack faces (no `node:*`).
 * Disk joins stay in {@link ./packPaths}.
 */

import { parsePrintKey } from "@/core/identify/printKey";

export const ASSETS_URL_PREFIX = "/assets";

/** Live stem ``me5_fr_045`` / ``swsh10-5_fr_011`` (keep in sync with malie). */
const BUNDLE_STEM_RE = /^([a-z0-9.-]+)_([a-z]{2,4})_(\d{3})(?:_[a-z]+)?$/i;

export type CardDiskId = { set: string; lang: string; card: string };

export function assetsPackBase(pack: string): string {
  return `${ASSETS_URL_PREFIX}/${pack}`;
}

export function assetsCardUrl(
  pack: string,
  id: CardDiskId,
  file: string,
): string {
  const parts = [id.set, id.lang, id.card, file].map((p) =>
    encodeURIComponent(p),
  );
  return `${assetsPackBase(pack)}/cards/${parts.join("/")}`;
}

export function assetsPackFileUrl(pack: string, ...segments: string[]): string {
  return `${assetsPackBase(pack)}/${segments.map((s) => encodeURIComponent(s)).join("/")}`;
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
 * `cards/{set}/{lang}/{card}/`.
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

/** `/assets/pokemon/cards/{set}/{lang}/{num}/{art|mask|…}.webp` */
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
