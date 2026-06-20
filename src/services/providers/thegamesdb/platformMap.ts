import { detectPlatformKey } from "@/lib/barcode/query";

const PLACARR_PLATFORM_KEY_TO_TGDB_ID: Record<string, number> = {
  xbox: 14,
  xbox360: 15,
  xboxone: 4920,
  xboxseries: 4981,
  ps1: 10,
  ps2: 11,
  ps3: 12,
  ps4: 4919,
  ps5: 4980,
  psp: 13,
  psvita: 39,
  wii: 9,
  wiiu: 38,
  switch: 4971,
  gamecube: 2,
  n64: 3,
  snes: 6,
  nes: 7,
  ds: 8,
  "3ds": 4912,
  gba: 5,
  gbc: 41,
  gb: 4,
  dreamcast: 16,
  megadrive: 36,
  mastersystem: 35,
  gamegear: 20,
  neogeo: 24,
  atari2600: 22,
  atari5200: 26,
  atari7800: 27,
};

export function resolveTheGamesDbPlatformId(
  platform?: string | null,
): number | null {
  if (!platform?.trim()) return null;
  const platformKey = detectPlatformKey(platform);
  if (!platformKey) return null;
  return PLACARR_PLATFORM_KEY_TO_TGDB_ID[platformKey] ?? null;
}
