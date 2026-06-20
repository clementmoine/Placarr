const PLATFORM_ALIASES: Record<string, string[]> = {
  ps1: ["Sony Playstation", "Sony PlayStation"],
  ps2: ["Sony Playstation 2", "Sony PlayStation 2"],
  ps3: ["Sony Playstation 3", "Sony PlayStation 3"],
  ps4: ["Sony Playstation 4", "Sony PlayStation 4"],
  ps5: ["Sony Playstation 5", "Sony PlayStation 5"],
  psp: ["Sony PSP"],
  "ps vita": ["Sony Playstation Vita", "Sony PlayStation Vita"],
  xbox: ["Microsoft Xbox"],
  xbox360: ["Microsoft Xbox 360"],
  xboxone: ["Microsoft Xbox One", "Microsoft Xbox Series X/S"],
  gamecube: ["Nintendo GameCube"],
  wii: ["Nintendo Wii"],
  wiiu: ["Nintendo Wii U"],
  switch: ["Nintendo Switch"],
  ds: ["Nintendo DS"],
  "3ds": ["Nintendo 3DS"],
  gba: ["Nintendo Game Boy Advance"],
  gbc: ["Nintendo Game Boy Color"],
  gb: ["Nintendo Game Boy"],
  nes: ["Nintendo Entertainment System"],
  snes: ["Super Nintendo Entertainment System"],
  n64: ["Nintendo 64"],
  pc: ["Microsoft Windows", "Windows"],
  dreamcast: ["Sega Dreamcast"],
  genesis: ["Sega Genesis", "Sega Mega Drive"],
  saturn: ["Sega Saturn"],
};

function normalizePlatform(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveLaunchBoxPlatformNames(
  platform?: string | null,
): string[] {
  if (!platform?.trim()) return [];

  const normalized = normalizePlatform(platform);
  const names = new Set<string>();

  for (const [key, aliases] of Object.entries(PLATFORM_ALIASES)) {
    if (
      normalized.includes(key) ||
      aliases.some((alias) => normalized.includes(normalizePlatform(alias)))
    ) {
      aliases.forEach((alias) => names.add(alias));
    }
  }

  if (/\bps2\b|\bplaystation 2\b/.test(normalized)) {
    names.add("Sony Playstation 2");
  }
  if (
    /\bps1\b|\bplaystation\b/.test(normalized) &&
    !/\bps[2-5]\b/.test(normalized)
  ) {
    names.add("Sony Playstation");
  }
  if (/\bxbox 360\b|\bxbox360\b/.test(normalized)) {
    names.add("Microsoft Xbox 360");
  }
  if (
    /\bxbox\b/.test(normalized) &&
    !/\bxbox (360|one|series)\b/.test(normalized)
  ) {
    names.add("Microsoft Xbox");
  }
  if (/\bgamecube\b/.test(normalized)) {
    names.add("Nintendo GameCube");
  }
  if (/\bwii u\b|\bwiiu\b/.test(normalized)) {
    names.add("Nintendo Wii U");
  }
  if (/\bwii\b/.test(normalized)) {
    names.add("Nintendo Wii");
  }

  return Array.from(names);
}

export function platformMatchesLaunchBoxEntry(
  requestedPlatform: string | null | undefined,
  entryPlatform: string,
): boolean {
  const candidates = resolveLaunchBoxPlatformNames(requestedPlatform);
  if (candidates.length === 0) return true;
  const normalizedEntry = normalizePlatform(entryPlatform);
  return candidates.some(
    (candidate) => normalizePlatform(candidate) === normalizedEntry,
  );
}
