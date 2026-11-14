/**
 * Malie CDN card layer URLs for a Live bundle stem — client-safe.
 *
 * Simey’s foil/etch paints were scraped from Malie then post-processed; we do
 * not store Simey’s ImageMagick outputs. For paint QA, show Malie layers next
 * to raw Live dump plates (`art` / `mask` / `etch`).
 *
 * @see https://malie.io/static/draft/html/pkproto_sv.html
 */

export const MALIE_CARD_PNG_BASE =
  "https://cdn.malie.io/file/malie-io/tcgl/cards/png";

const BUNDLE_STEM_RE =
  /^([a-z0-9.-]+)_([a-z]{2,4})_(\d{3})(?:_([a-z]+))?$/i;

export type PokemonBundleStemParts = {
  set: string;
  lang: string;
  num: string;
  /** Live variant suffix when present on the stem (rare). */
  suffix?: string;
};

export function parsePokemonBundleStem(
  bundleId: string,
): PokemonBundleStemParts | null {
  const m = BUNDLE_STEM_RE.exec(bundleId.trim());
  if (!m) return null;
  return {
    set: m[1]!.toLowerCase(),
    lang: m[2]!.toLowerCase(),
    num: m[3]!,
    ...(m[4] ? { suffix: m[4]!.toLowerCase() } : {}),
  };
}

export type MalieCardLayerUrls = {
  /** Full card front (std/ph). */
  front: string;
  /** Foil layer PNG — Simey’s upstream before ImageMagick. */
  foil: string;
  /** Etch / relief layer PNG (may 404 when Malie has none). */
  etch: string;
};

/**
 * CDN URLs for Malie front / foil / etch of the same print as `bundleId`.
 * `variant` = Live `std` | `ph` | … (default `std`).
 */
export function malieCardLayerUrls(
  bundleId: string,
  variant: string = "std",
): MalieCardLayerUrls | null {
  const parts = parsePokemonBundleStem(bundleId);
  if (!parts) return null;
  const v = (variant.trim() || "std").toLowerCase();
  const fileStem = `${parts.set}_${parts.lang}_${parts.num}_${v}`;
  const dir = `${MALIE_CARD_PNG_BASE}/${parts.lang}/${parts.set}`;
  return {
    front: `${dir}/${fileStem}.png`,
    foil: `${dir}/${fileStem}.foil.png`,
    etch: `${dir}/${fileStem}.etch.png`,
  };
}
