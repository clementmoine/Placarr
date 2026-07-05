import {
  detectVideoGamePlatformKey,
  isVideoGamePlatformKey,
  normalizeVideoGamePlatformText,
  type VideoGamePlatformKey,
} from "@/lib/games/platforms";

export type PriceChartingPlatformSlugs = {
  default: string;
  pal?: string;
};

/** PriceCharting URL path segments keyed by Placarr platform key. */
const PRICE_CHARTING_PLATFORM_SLUGS: Partial<
  Record<VideoGamePlatformKey, PriceChartingPlatformSlugs>
> = {
  xbox360: { pal: "pal-xbox-360", default: "xbox-360" },
  xbox: { pal: "pal-xbox", default: "xbox" },
  ps3: { pal: "pal-playstation-3", default: "playstation-3" },
  ps2: { pal: "pal-playstation-2", default: "playstation-2" },
  ps1: { pal: "pal-playstation", default: "playstation" },
  wii: { pal: "pal-wii", default: "wii" },
  gamecube: { pal: "pal-gamecube", default: "gamecube" },
};

export function getPriceChartingPlatformSlugs(
  key: VideoGamePlatformKey | string | null | undefined,
): PriceChartingPlatformSlugs | null {
  if (!key) return null;
  const platformKey = isVideoGamePlatformKey(key)
    ? key
    : detectVideoGamePlatformKey(key);
  if (!platformKey) return null;
  return PRICE_CHARTING_PLATFORM_SLUGS[platformKey] ?? null;
}

/** Neo Geo AES/MVS/CD share one canonical key but PriceCharting uses separate slugs. */
export function resolvePriceChartingPlatformSlug(
  platformOrShelf: string | null | undefined,
  options?: { barcode?: string | null; isPal?: boolean },
): string | null {
  const platformKey = detectVideoGamePlatformKey(platformOrShelf || "");
  if (platformKey !== "neogeo") {
    const slugs = getPriceChartingPlatformSlugs(platformKey);
    if (!slugs) return null;
    return options?.isPal && slugs.pal ? slugs.pal : slugs.default;
  }

  const norm = normalizeVideoGamePlatformText(platformOrShelf || "");
  if (/\bmvs\b/.test(norm)) return "neo-geo-mvs";
  if (/\bcd\b/.test(norm)) return "neo-geo-cd";

  const cleanedBarcode = options?.barcode?.replace(/\D/g, "") ?? "";
  const isJapaneseBarcode = /^49/.test(cleanedBarcode);
  const isJapaneseLabel = /\b(jp|jpn|japan)\b/.test(norm);

  if (/\baes\b/.test(norm) || platformKey === "neogeo") {
    return isJapaneseBarcode || isJapaneseLabel
      ? "jp-neo-geo-aes"
      : "neo-geo-aes";
  }

  return null;
}

export function priceChartingNeoGeoVariantMatchesShelf(
  parsedPlatform: string | undefined,
  shelfOrPlatform: string | null | undefined,
): boolean {
  const targetNorm = normalizeVideoGamePlatformText(shelfOrPlatform || "");
  const parsedNorm = normalizeVideoGamePlatformText(parsedPlatform || "");
  if (!/\bneo\s*geo\b/.test(targetNorm) && !/\bneo\s*geo\b/.test(parsedNorm)) {
    return true;
  }

  const targetAes = /\baes\b/.test(targetNorm);
  const targetMvs = /\bmvs\b/.test(targetNorm);
  const targetCd = /\bcd\b/.test(targetNorm);
  const parsedAes = /\baes\b/.test(parsedNorm);
  const parsedMvs = /\bmvs\b/.test(parsedNorm);
  const parsedCd = /\bcd\b/.test(parsedNorm);

  if (targetAes) return parsedAes && !parsedMvs && !parsedCd;
  if (targetMvs) return parsedMvs && !parsedAes && !parsedCd;
  if (targetCd) return parsedCd && !parsedAes && !parsedMvs;
  return true;
}
