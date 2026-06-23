import {
  LAUNCHBOX_PLATFORM_REFERENCES,
  SCREEN_SCRAPER_PLATFORM_REFERENCES,
} from "@/lib/videoGamePlatformSources";

export {
  LAUNCHBOX_PLATFORM_REFERENCES,
  SCREEN_SCRAPER_PLATFORM_REFERENCES,
} from "@/lib/videoGamePlatformSources";

export type PriceChartingPlatformSlugs = {
  default: string;
  pal?: string;
};

export type CoverProjectPlatformSpec = {
  folder: string;
  prefix: string;
};

type VideoGamePlatformDefinition = {
  key: string;
  label: string;
  aliases: readonly string[];
  launchBoxNames?: readonly string[];
  theGamesDbId?: number;
  screenScraperSystemId?: number;
  priceCharting?: PriceChartingPlatformSlugs;
  coverProject?: readonly CoverProjectPlatformSpec[];
};

export const VIDEO_GAME_PLATFORMS = [
  {
    key: "xboxseries",
    label: "Xbox Series",
    aliases: [
      "xbox series x",
      "xbox series s",
      "xbox series",
      "xbox sx",
      "xbox s/x",
      "xbox series s/x",
    ],
    launchBoxNames: ["Microsoft Xbox Series X/S"],
    theGamesDbId: 4981,
    screenScraperSystemId: 34,
  },
  {
    key: "xboxone",
    label: "Xbox One",
    aliases: ["xbox one", "xboxone"],
    launchBoxNames: ["Microsoft Xbox One"],
    theGamesDbId: 4920,
    screenScraperSystemId: 34,
  },
  {
    key: "xbox360",
    label: "Xbox 360",
    aliases: ["xbox 360", "xbox360"],
    launchBoxNames: ["Microsoft Xbox 360"],
    theGamesDbId: 15,
    screenScraperSystemId: 33,
    priceCharting: { pal: "pal-xbox-360", default: "xbox-360" },
    coverProject: [{ folder: "xbox_360", prefix: "xbox360_" }],
  },
  {
    key: "xbox",
    label: "Xbox",
    aliases: ["xbox original", "original xbox", "xbox"],
    launchBoxNames: ["Microsoft Xbox"],
    theGamesDbId: 14,
    screenScraperSystemId: 32,
    priceCharting: { pal: "pal-xbox", default: "xbox" },
    coverProject: [{ folder: "xbox", prefix: "xbox_" }],
  },
  {
    key: "ps5",
    label: "PlayStation 5",
    aliases: ["playstation 5", "ps5"],
    launchBoxNames: ["Sony Playstation 5", "Sony PlayStation 5"],
    theGamesDbId: 4980,
    screenScraperSystemId: 284,
    coverProject: [{ folder: "playstation_5", prefix: "ps5_" }],
  },
  {
    key: "ps4",
    label: "PlayStation 4",
    aliases: ["playstation 4", "ps4"],
    launchBoxNames: ["Sony Playstation 4", "Sony PlayStation 4"],
    theGamesDbId: 4919,
    screenScraperSystemId: 60,
    coverProject: [{ folder: "playstation_4", prefix: "ps4_" }],
  },
  {
    key: "ps3",
    label: "PlayStation 3",
    aliases: ["playstation 3", "ps3"],
    launchBoxNames: ["Sony Playstation 3", "Sony PlayStation 3"],
    theGamesDbId: 12,
    screenScraperSystemId: 59,
    priceCharting: { pal: "pal-playstation-3", default: "playstation-3" },
    coverProject: [{ folder: "playstation_3", prefix: "ps3_" }],
  },
  {
    key: "ps2",
    label: "PlayStation 2",
    aliases: ["playstation 2", "ps2"],
    launchBoxNames: ["Sony Playstation 2", "Sony PlayStation 2"],
    theGamesDbId: 11,
    screenScraperSystemId: 58,
    priceCharting: { pal: "pal-playstation-2", default: "playstation-2" },
    coverProject: [{ folder: "playstation_2", prefix: "ps2_" }],
  },
  {
    key: "psp",
    label: "PlayStation Portable",
    aliases: ["playstation portable", "psp"],
    launchBoxNames: ["Sony PSP"],
    theGamesDbId: 13,
    screenScraperSystemId: 61,
  },
  {
    key: "psvita",
    label: "PlayStation Vita",
    aliases: ["playstation vita", "ps vita", "vita", "psvita"],
    launchBoxNames: ["Sony Playstation Vita", "Sony PlayStation Vita"],
    theGamesDbId: 39,
    screenScraperSystemId: 62,
  },
  {
    key: "ps1",
    label: "PlayStation",
    aliases: ["playstation 1", "ps1", "psone", "playstation"],
    launchBoxNames: ["Sony Playstation", "Sony PlayStation"],
    theGamesDbId: 10,
    screenScraperSystemId: 57,
    priceCharting: { pal: "pal-playstation", default: "playstation" },
    coverProject: [
      { folder: "playstation", prefix: "ps_" },
      { folder: "playstation_1", prefix: "ps1_" },
    ],
  },
  {
    key: "wiiu",
    label: "Wii U",
    aliases: ["wii u", "wiiu"],
    launchBoxNames: ["Nintendo Wii U"],
    theGamesDbId: 38,
    screenScraperSystemId: 18,
    coverProject: [
      { folder: "nintendo_wii_u", prefix: "wiiu_" },
      { folder: "wii_u", prefix: "wiiu_" },
    ],
  },
  {
    key: "wii",
    label: "Wii",
    aliases: ["wii"],
    launchBoxNames: ["Nintendo Wii"],
    theGamesDbId: 9,
    screenScraperSystemId: 16,
    priceCharting: { pal: "pal-wii", default: "wii" },
    coverProject: [{ folder: "nintendo_wii", prefix: "wii_" }],
  },
  {
    key: "switch",
    label: "Nintendo Switch",
    aliases: ["nintendo switch", "switch"],
    launchBoxNames: ["Nintendo Switch"],
    theGamesDbId: 4971,
    screenScraperSystemId: 225,
    coverProject: [{ folder: "nintendo_switch", prefix: "switch_" }],
  },
  {
    key: "gamecube",
    label: "GameCube",
    aliases: ["nintendo gamecube", "gamecube", "game cube", "gcn"],
    launchBoxNames: ["Nintendo GameCube"],
    theGamesDbId: 2,
    screenScraperSystemId: 13,
    priceCharting: { pal: "pal-gamecube", default: "gamecube" },
    coverProject: [
      { folder: "gamecube", prefix: "gc_" },
      { folder: "nintendo_gamecube", prefix: "gc_" },
    ],
  },
  {
    key: "n64",
    label: "Nintendo 64",
    aliases: ["nintendo 64", "n64"],
    launchBoxNames: ["Nintendo 64"],
    theGamesDbId: 3,
    screenScraperSystemId: 14,
    coverProject: [{ folder: "nintendo_64", prefix: "n64_" }],
  },
  {
    key: "snes",
    label: "Super Nintendo",
    aliases: [
      "super nintendo entertainment system",
      "super nintendo",
      "super nes",
      "snes",
    ],
    launchBoxNames: ["Super Nintendo Entertainment System"],
    theGamesDbId: 6,
    screenScraperSystemId: 4,
    coverProject: [{ folder: "super_nintendo", prefix: "snes_" }],
  },
  {
    key: "nes",
    label: "Nintendo Entertainment System",
    aliases: ["nintendo entertainment system", "nintendo nes", "nes"],
    launchBoxNames: ["Nintendo Entertainment System"],
    theGamesDbId: 7,
    screenScraperSystemId: 3,
    coverProject: [{ folder: "nintendo", prefix: "nes_" }],
  },
  {
    key: "3ds",
    label: "Nintendo 3DS",
    aliases: ["nintendo 3ds", "3ds"],
    launchBoxNames: ["Nintendo 3DS"],
    theGamesDbId: 4912,
    screenScraperSystemId: 17,
    coverProject: [{ folder: "nintendo_3ds", prefix: "3ds_" }],
  },
  {
    key: "ds",
    label: "Nintendo DS",
    aliases: ["nintendo ds", "nds", "ds"],
    launchBoxNames: ["Nintendo DS"],
    theGamesDbId: 8,
    screenScraperSystemId: 15,
    coverProject: [{ folder: "nintendo_ds", prefix: "ds_" }],
  },
  {
    key: "gba",
    label: "Game Boy Advance",
    aliases: ["game boy advance", "gameboy advance", "gba"],
    launchBoxNames: ["Nintendo Game Boy Advance"],
    theGamesDbId: 5,
    screenScraperSystemId: 12,
    coverProject: [{ folder: "gameboy_advance", prefix: "gba_" }],
  },
  {
    key: "gbc",
    label: "Game Boy Color",
    aliases: ["game boy color", "gameboy color", "gbc"],
    launchBoxNames: ["Nintendo Game Boy Color"],
    theGamesDbId: 41,
    screenScraperSystemId: 10,
    coverProject: [{ folder: "gameboy_color", prefix: "gbc_" }],
  },
  {
    key: "gb",
    label: "Game Boy",
    aliases: ["game boy", "gameboy", "gb"],
    launchBoxNames: ["Nintendo Game Boy"],
    theGamesDbId: 4,
    screenScraperSystemId: 9,
    coverProject: [{ folder: "gameboy", prefix: "gb_" }],
  },
  {
    key: "pc",
    label: "PC",
    aliases: ["pc windows", "pc", "windows", "microsoft windows"],
    launchBoxNames: ["Microsoft Windows", "Windows"],
    screenScraperSystemId: 138,
  },
  {
    key: "dreamcast",
    label: "Dreamcast",
    aliases: ["sega dreamcast", "dreamcast"],
    launchBoxNames: ["Sega Dreamcast"],
    theGamesDbId: 16,
    screenScraperSystemId: 23,
  },
  {
    key: "megadrive",
    label: "Mega Drive",
    aliases: [
      "sega mega drive",
      "mega drive",
      "megadrive",
      "sega genesis",
      "genesis",
    ],
    launchBoxNames: ["Sega Genesis", "Sega Mega Drive"],
    theGamesDbId: 36,
    screenScraperSystemId: 21,
  },
  {
    key: "mastersystem",
    label: "Master System",
    aliases: ["sega master system", "master system", "mastersystem"],
    theGamesDbId: 35,
    screenScraperSystemId: 2,
  },
  {
    key: "gamegear",
    label: "Game Gear",
    aliases: ["sega game gear", "game gear", "gamegear"],
    theGamesDbId: 20,
    screenScraperSystemId: 22,
  },
  {
    key: "neogeo",
    label: "Neo Geo",
    aliases: ["neo geo", "neogeo"],
    theGamesDbId: 24,
    screenScraperSystemId: 24,
  },
  {
    key: "atari2600",
    label: "Atari 2600",
    aliases: ["atari 2600", "atari2600"],
    theGamesDbId: 22,
    screenScraperSystemId: 26,
  },
  {
    key: "atari5200",
    label: "Atari 5200",
    aliases: ["atari 5200", "atari5200"],
    theGamesDbId: 26,
  },
  {
    key: "atari7800",
    label: "Atari 7800",
    aliases: ["atari 7800", "atari7800"],
    theGamesDbId: 27,
  },
  {
    key: "saturn",
    label: "Saturn",
    aliases: ["sega saturn", "saturn"],
    launchBoxNames: ["Sega Saturn"],
  },
] as const satisfies readonly VideoGamePlatformDefinition[];

export type VideoGamePlatformKey = (typeof VIDEO_GAME_PLATFORMS)[number]["key"];

type VideoGamePlatform = VideoGamePlatformDefinition & {
  key: VideoGamePlatformKey;
};

const VIDEO_GAME_PLATFORM_DEFINITIONS =
  VIDEO_GAME_PLATFORMS as readonly VideoGamePlatform[];

const PLATFORM_BY_KEY = new Map<VideoGamePlatformKey, VideoGamePlatform>(
  VIDEO_GAME_PLATFORM_DEFINITIONS.map((platform) => [platform.key, platform]),
);

const SCREEN_SCRAPER_SYSTEM_TO_PLATFORM_KEY = new Map<
  number,
  VideoGamePlatformKey
>();
for (const platform of VIDEO_GAME_PLATFORM_DEFINITIONS) {
  if (platform.screenScraperSystemId) {
    // Some source systems are shared (e.g. Xbox Series uses the Xbox One id).
    // Later canonical entries win for reverse lookups.
    SCREEN_SCRAPER_SYSTEM_TO_PLATFORM_KEY.set(
      platform.screenScraperSystemId,
      platform.key,
    );
  }
}

const SCREEN_SCRAPER_SYSTEM_IDS_BY_NORMALIZED_NAME = new Map<
  string,
  Set<number>
>();
for (const platform of SCREEN_SCRAPER_PLATFORM_REFERENCES) {
  for (const name of platform.names) {
    const normalized = normalizeVideoGamePlatformText(name);
    if (normalized) {
      const systemIds =
        SCREEN_SCRAPER_SYSTEM_IDS_BY_NORMALIZED_NAME.get(normalized) ??
        new Set<number>();
      systemIds.add(platform.id);
      SCREEN_SCRAPER_SYSTEM_IDS_BY_NORMALIZED_NAME.set(normalized, systemIds);
    }
  }
}

const SCREEN_SCRAPER_SYSTEM_ID_BY_NORMALIZED_NAME = new Map<string, number>();
for (const [name, systemIds] of SCREEN_SCRAPER_SYSTEM_IDS_BY_NORMALIZED_NAME) {
  if (systemIds.size === 1) {
    SCREEN_SCRAPER_SYSTEM_ID_BY_NORMALIZED_NAME.set(
      name,
      [...systemIds][0] ?? 0,
    );
  }
}

const LAUNCHBOX_PLATFORM_BY_NORMALIZED_NAME = new Map<string, string>();
for (const platform of LAUNCHBOX_PLATFORM_REFERENCES) {
  const normalized = normalizeVideoGamePlatformText(platform.name);
  if (normalized) {
    LAUNCHBOX_PLATFORM_BY_NORMALIZED_NAME.set(normalized, platform.name);
  }
}

export const VIDEO_GAME_PLATFORM_KEYS = VIDEO_GAME_PLATFORMS.map(
  (platform) => platform.key,
) as VideoGamePlatformKey[];

const SOURCE_VIDEO_GAME_PLATFORM_TERMS = [
  ...SCREEN_SCRAPER_PLATFORM_REFERENCES.flatMap((platform) => platform.names),
  ...LAUNCHBOX_PLATFORM_REFERENCES.map((platform) => platform.name),
];

export const VIDEO_GAME_PLATFORM_TERMS = Array.from(
  new Set(
    VIDEO_GAME_PLATFORM_DEFINITIONS.flatMap((platform) =>
      platform.aliases.map((alias) => normalizeVideoGamePlatformText(alias)),
    ),
  ),
).filter(Boolean);

export const VIDEO_GAME_PLATFORM_TOKEN_TERMS = Array.from(
  new Set([
    ...VIDEO_GAME_PLATFORM_KEYS,
    "playstation",
    "xbox",
    "nintendo",
    "wii",
    "wiiu",
    "switch",
    "ds",
    "3ds",
    "pc",
    "windows",
  ]),
);

export const KNOWN_VIDEO_GAME_PLATFORM_TERMS = Array.from(
  new Set(
    [...VIDEO_GAME_PLATFORM_TERMS, ...SOURCE_VIDEO_GAME_PLATFORM_TERMS].map(
      (name) => normalizeVideoGamePlatformText(name),
    ),
  ),
)
  .filter(Boolean)
  .sort((a, b) => b.length - a.length);

const SCREEN_SCRAPER_SOURCE_PLATFORM_TERMS =
  KNOWN_VIDEO_GAME_PLATFORM_TERMS.filter((term) =>
    SCREEN_SCRAPER_SYSTEM_ID_BY_NORMALIZED_NAME.has(term),
  ).sort((a, b) => {
    const tokenDiff = b.split(/\s+/).length - a.split(/\s+/).length;
    return tokenDiff || b.length - a.length;
  });

const SCREEN_SCRAPER_NUMBERED_SOURCE_PLATFORM_TERMS =
  SCREEN_SCRAPER_SOURCE_PLATFORM_TERMS.filter((term) => /\d/.test(term));

const DETECTION_ALIASES = VIDEO_GAME_PLATFORM_DEFINITIONS.flatMap((platform) =>
  platform.aliases.map((alias) => ({
    key: platform.key,
    alias: normalizeVideoGamePlatformText(alias),
  })),
)
  .filter((entry) => entry.alias.length > 0)
  .sort((a, b) => b.alias.length - a.alias.length);

export function normalizeVideoGamePlatformText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[._/-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isVideoGamePlatformKey(
  value: string | null | undefined,
): value is VideoGamePlatformKey {
  return Boolean(value && PLATFORM_BY_KEY.has(value as VideoGamePlatformKey));
}

export function getVideoGamePlatform(
  key: VideoGamePlatformKey | string | null | undefined,
): VideoGamePlatform | null {
  if (!isVideoGamePlatformKey(key)) return null;
  return PLATFORM_BY_KEY.get(key) || null;
}

export function detectVideoGamePlatformKey(
  value?: string | null,
): VideoGamePlatformKey | null {
  if (!value?.trim()) return null;

  const normalized = normalizeVideoGamePlatformText(value);
  if (!normalized) return null;
  const padded = ` ${normalized} `;

  for (const entry of DETECTION_ALIASES) {
    if (padded.includes(` ${entry.alias} `)) {
      return entry.key;
    }
  }

  return null;
}

export function detectKnownVideoGamePlatformName(
  value?: string | null,
): string | null {
  if (!value?.trim()) return null;

  const normalized = normalizeVideoGamePlatformText(value);
  if (!normalized) return null;
  const padded = ` ${normalized} `;

  for (const term of KNOWN_VIDEO_GAME_PLATFORM_TERMS) {
    if (padded.includes(` ${term} `)) {
      return term;
    }
  }

  return null;
}

function escapePlatformPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function platformTermPattern(term: string): string {
  return term.split(/\s+/).map(escapePlatformPattern).join("[\\s._/-]+");
}

export function createVideoGamePlatformMatcher(flags = "gi"): RegExp {
  const pattern = [...VIDEO_GAME_PLATFORM_TERMS]
    .sort((a, b) => b.length - a.length)
    .map(platformTermPattern)
    .join("|");

  return new RegExp(`\\b(?:${pattern || "a^"})\\b`, flags);
}

export function getTheGamesDbPlatformId(
  key: VideoGamePlatformKey | string | null | undefined,
): number | null {
  return getVideoGamePlatform(key)?.theGamesDbId ?? null;
}

export function getScreenScraperSystemId(
  key: VideoGamePlatformKey | string | null | undefined,
): number | null {
  return getVideoGamePlatform(key)?.screenScraperSystemId ?? null;
}

export function getPlatformKeyByScreenScraperSystemId(
  systemId?: number | null,
): VideoGamePlatformKey | null {
  if (!systemId) return null;
  return SCREEN_SCRAPER_SYSTEM_TO_PLATFORM_KEY.get(systemId) ?? null;
}

function detectScreenScraperSystemIdFromTerms(
  paddedNormalizedValue: string,
  terms: readonly string[],
): number | null {
  for (const term of terms) {
    const sourceSystemId =
      SCREEN_SCRAPER_SYSTEM_ID_BY_NORMALIZED_NAME.get(term);
    if (sourceSystemId && paddedNormalizedValue.includes(` ${term} `)) {
      return sourceSystemId;
    }
  }

  return null;
}

export function detectScreenScraperSystemId(
  value?: string | null,
): number | null {
  const normalized = normalizeVideoGamePlatformText(value || "");
  if (!normalized) return null;

  const exactSourceSystemId =
    SCREEN_SCRAPER_SYSTEM_ID_BY_NORMALIZED_NAME.get(normalized);
  if (exactSourceSystemId) return exactSourceSystemId;

  const padded = ` ${normalized} `;
  const numberedSourceSystemId = detectScreenScraperSystemIdFromTerms(
    padded,
    SCREEN_SCRAPER_NUMBERED_SOURCE_PLATFORM_TERMS,
  );
  if (numberedSourceSystemId) return numberedSourceSystemId;

  const canonicalSystemId = getScreenScraperSystemId(
    detectVideoGamePlatformKey(value),
  );
  if (canonicalSystemId) return canonicalSystemId;

  return detectScreenScraperSystemIdFromTerms(
    padded,
    SCREEN_SCRAPER_SOURCE_PLATFORM_TERMS,
  );
}

export function getPriceChartingPlatformSlugs(
  key: VideoGamePlatformKey | string | null | undefined,
): PriceChartingPlatformSlugs | null {
  return getVideoGamePlatform(key)?.priceCharting ?? null;
}

export function getCoverProjectPlatformSpecs(
  key: VideoGamePlatformKey | string | null | undefined,
): readonly CoverProjectPlatformSpec[] {
  return getVideoGamePlatform(key)?.coverProject ?? [];
}

export function resolveLaunchBoxPlatformNames(
  platform?: string | null,
): string[] {
  const normalized = normalizeVideoGamePlatformText(platform || "");
  const exactSourceName = LAUNCHBOX_PLATFORM_BY_NORMALIZED_NAME.get(normalized);
  if (exactSourceName) return [exactSourceName];

  const key = detectVideoGamePlatformKey(platform);
  const canonicalNames = key
    ? [...(getVideoGamePlatform(key)?.launchBoxNames ?? [])]
    : [];
  if (canonicalNames.length > 0) return canonicalNames;

  const knownPlatformName = detectKnownVideoGamePlatformName(normalized);
  const knownSourceName = knownPlatformName
    ? LAUNCHBOX_PLATFORM_BY_NORMALIZED_NAME.get(knownPlatformName)
    : null;

  return knownSourceName ? [knownSourceName] : [];
}
