import { detectVideoGamePlatformKey } from "@/lib/games/platforms";

export type HdjvPlatformSpec = {
  supportCode: string;
  ficheLabel: string;
};

/** HDJV platform select values → fiche URL segment (from live ajax/search). */
export const HDJV_PLATFORM_BY_KEY: Partial<Record<string, HdjvPlatformSpec>> = {
  xbox360: { supportCode: "5", ficheLabel: "Xbox 360" },
  xbox: { supportCode: "4", ficheLabel: "Xbox" },
  ps3: { supportCode: "44", ficheLabel: "PS3" },
  ps2: { supportCode: "1", ficheLabel: "PS2" },
  ps1: { supportCode: "15", ficheLabel: "Playstation" },
  psp: { supportCode: "14", ficheLabel: "PSP" },
  wii: { supportCode: "43", ficheLabel: "Wii" },
  gamecube: { supportCode: "9", ficheLabel: "GameCube" },
  n64: { supportCode: "8", ficheLabel: "Nintendo 64" },
  snes: { supportCode: "7", ficheLabel: "SNES" },
  nes: { supportCode: "2", ficheLabel: "NES - Famicom" },
  ds: { supportCode: "16", ficheLabel: "DS" },
  "3ds": { supportCode: "61", ficheLabel: "3DS" },
  gba: { supportCode: "18", ficheLabel: "Game Boy Advance" },
  gb: { supportCode: "23", ficheLabel: "Game Boy" },
  gbc: { supportCode: "24", ficheLabel: "Game Boy Color" },
  pc: { supportCode: "3", ficheLabel: "PC" },
  dreamcast: { supportCode: "10", ficheLabel: "Dreamcast" },
  saturn: { supportCode: "11", ficheLabel: "Saturn" },
  mastersystem: { supportCode: "13", ficheLabel: "Master System" },
  megadrive: { supportCode: "12", ficheLabel: "Mega Drive - Genesis" },
  neogeo: { supportCode: "6", ficheLabel: "Neo Geo" },
  gamegear: { supportCode: "29", ficheLabel: "Game Gear" },
  atari2600: { supportCode: "22", ficheLabel: "Atari 2600" },
  atari5200: { supportCode: "28", ficheLabel: "Atari 5200" },
  atari7800: { supportCode: "26", ficheLabel: "Atari 7800" },
};

export function resolveHdjvPlatform(
  platform?: string | null,
): HdjvPlatformSpec | null {
  if (!platform?.trim()) return null;
  const key = detectVideoGamePlatformKey(platform);
  if (!key) return null;
  return HDJV_PLATFORM_BY_KEY[key] ?? null;
}
