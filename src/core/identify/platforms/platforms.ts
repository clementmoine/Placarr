import {
  LAUNCHBOX_PLATFORM_REFERENCES,
  SCREEN_SCRAPER_PLATFORM_REFERENCES,
} from "@/core/identify/platforms/platformSources";

export {
  LAUNCHBOX_PLATFORM_REFERENCES,
  SCREEN_SCRAPER_PLATFORM_REFERENCES,
} from "@/core/identify/platforms/platformSources";

export type {
  CoverProjectPlatformSpec,
  VideoGamePlatformKey,
} from "@/core/identify/platforms/platformList";

export {
  VIDEO_GAME_PLATFORMS,
  VIDEO_GAME_PLATFORM_KEYS,
  VIDEO_GAME_PLATFORM_TERMS,
  VIDEO_GAME_PLATFORM_TOKEN_TERMS,
  isVideoGamePlatformKey,
  normalizeVideoGamePlatformText,
  detectVideoGamePlatformKey,
  getVideoGamePlatform,
  createVideoGamePlatformMatcher,
  createTrailingVideoGamePlatformSuffixMatcher,
  createSequelNumberBeforePlatformMatcher,
  videoGamePlatformTermAlternation,
  getTheGamesDbPlatformId,
  getPlatformKeyByTheGamesDbPlatformId,
  getScreenScraperSystemId,
  getPlatformKeyByScreenScraperSystemId,
  getCoverProjectPlatformSpecs,
  videoGamePlatformListingTypeSignal,
  videoGamePlatformTargetsPhysicalMedia,
  canonicalizeVideoGamePlatformAliasSpan,
} from "@/core/identify/platforms/platformList";

import {
  VIDEO_GAME_PLATFORMS,
  VIDEO_GAME_PLATFORM_TERMS,
  isVideoGamePlatformKey,
  normalizeVideoGamePlatformText,
  detectVideoGamePlatformKey,
  getVideoGamePlatform,
  getScreenScraperSystemId,
  type VideoGamePlatformKey,
} from "@/core/identify/platforms/platformList";

type VideoGamePlatform = (typeof VIDEO_GAME_PLATFORMS)[number];

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

const SOURCE_VIDEO_GAME_PLATFORM_TERMS = [
  ...SCREEN_SCRAPER_PLATFORM_REFERENCES.flatMap((platform) => platform.names),
  ...LAUNCHBOX_PLATFORM_REFERENCES.map((platform) => platform.name),
];

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
