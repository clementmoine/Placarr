import {
  detectVideoGamePlatformKey,
  isVideoGamePlatformKey,
  normalizeVideoGamePlatformText,
  type VideoGamePlatformKey,
} from "@/lib/games/platforms";

/** Store / PC-digital shelf labels that should not pollute title-based detection. */
const SHELF_GAME_PLATFORM_OVERRIDES: Record<string, VideoGamePlatformKey> = {
  steam: "pc",
  gog: "pc",
  "gog com": "pc",
  "epic games": "pc",
  "epic games store": "pc",
};

function shelfPlatformOverride(
  value?: string | null,
): VideoGamePlatformKey | undefined {
  if (!value?.trim()) return undefined;
  const normalized = normalizeVideoGamePlatformText(value);
  return SHELF_GAME_PLATFORM_OVERRIDES[normalized];
}

function normalizeGamePlatform(value: string): string | undefined {
  const trimmed = value.trim();
  if (isVideoGamePlatformKey(trimmed)) return trimmed;

  const storeOverride = shelfPlatformOverride(trimmed);
  if (storeOverride) return storeOverride;

  return detectVideoGamePlatformKey(trimmed) ?? undefined;
}

/**
 * Platform key from a shelf label (exact store names + canonical detection).
 * Use this for shelf routing/compatibility, not product titles.
 */
export function detectShelfGamePlatformKey(
  shelfName?: string | null,
): VideoGamePlatformKey | undefined {
  if (!shelfName?.trim()) return undefined;

  const storeOverride = shelfPlatformOverride(shelfName);
  if (storeOverride) return storeOverride;

  return detectVideoGamePlatformKey(shelfName) ?? undefined;
}

/**
 * Resolves the game platform passed to metadata providers. Explicit platform
 * wins; otherwise infer from a platform-specific shelf name (e.g. "PlayStation 5").
 */
export function resolveGameMetadataPlatform(
  platform?: string | null,
  shelfName?: string | null,
  shelfType?: string | null,
): string | undefined {
  if (shelfType && shelfType !== "games") return undefined;

  if (platform?.trim()) {
    return normalizeGamePlatform(platform);
  }

  return detectShelfGamePlatformKey(shelfName);
}
