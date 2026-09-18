import {
  detectVideoGamePlatformKey,
  isVideoGamePlatformKey,
  normalizeVideoGamePlatformText,
  type VideoGamePlatformKey,
} from "@/core/identify/platforms/platforms";

export type PriceChartingPlatformSlugs = {
  default: string;
  pal?: string;
};

/** PriceCharting URL path segments keyed by Placarr platform key. */
const PRICE_CHARTING_PLATFORM_SLUGS: Partial<
  Record<VideoGamePlatformKey, PriceChartingPlatformSlugs>
> = {
  xboxseries: { pal: "pal-xbox-series-x", default: "xbox-series-x" },
  xboxone: { pal: "pal-xbox-one", default: "xbox-one" },
  xbox360: { pal: "pal-xbox-360", default: "xbox-360" },
  xbox: { pal: "pal-xbox", default: "xbox" },
  ps5: { pal: "pal-playstation-5", default: "playstation-5" },
  ps4: { pal: "pal-playstation-4", default: "playstation-4" },
  ps3: { pal: "pal-playstation-3", default: "playstation-3" },
  ps2: { pal: "pal-playstation-2", default: "playstation-2" },
  ps1: { pal: "pal-playstation", default: "playstation" },
  psp: { pal: "pal-psp", default: "psp" },
  psvita: { pal: "pal-playstation-vita", default: "playstation-vita" },
  switch2: { pal: "pal-nintendo-switch-2", default: "nintendo-switch-2" },
  switch: { pal: "pal-nintendo-switch", default: "nintendo-switch" },
  wiiu: { pal: "pal-wii-u", default: "wii-u" },
  wii: { pal: "pal-wii", default: "wii" },
  gamecube: { pal: "pal-gamecube", default: "gamecube" },
  n64: { pal: "pal-nintendo-64", default: "nintendo-64" },
  snes: { pal: "pal-super-nintendo", default: "super-nintendo" },
  nes: { pal: "pal-nes", default: "nes" },
  "3ds": { pal: "pal-3ds", default: "3ds" },
  ds: { pal: "pal-nintendo-ds", default: "nintendo-ds" },
  gba: { pal: "pal-gameboy-advance", default: "gameboy-advance" },
  gbc: { pal: "pal-gameboy-color", default: "gameboy-color" },
  gb: { pal: "pal-gameboy", default: "gameboy" },
  gameandwatch: { pal: "pal-game-&-watch", default: "game-&-watch" },
  pc: { default: "pc-games" },
  dreamcast: { pal: "pal-dreamcast", default: "dreamcast" },
  megadrive: { pal: "pal-sega-mega-drive", default: "sega-genesis" },
  mastersystem: {
    pal: "pal-sega-master-system",
    default: "sega-master-system",
  },
  gamegear: { pal: "pal-sega-game-gear", default: "sega-game-gear" },
  saturn: { pal: "pal-sega-saturn", default: "sega-saturn" },
  atari2600: { pal: "pal-atari-2600", default: "atari-2600" },
  atari5200: { default: "atari-5200" },
  atari7800: { default: "atari-7800" },
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
