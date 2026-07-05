import {
  detectVideoGamePlatformKey,
  isVideoGamePlatformKey,
  normalizeVideoGamePlatformText,
  type VideoGamePlatformKey,
} from "@/core/games/platforms";

/**
 * Platform key from a shelf label (canonical detection only — aliases live on
 * the platform table, not in core maps).
 */
export function detectShelfGamePlatformKey(
  shelfName?: string | null,
): VideoGamePlatformKey | undefined {
  if (!shelfName?.trim()) return undefined;
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
    const trimmed = platform.trim();
    if (isVideoGamePlatformKey(trimmed)) return trimmed;
    return detectVideoGamePlatformKey(trimmed) ?? undefined;
  }

  return detectShelfGamePlatformKey(shelfName);
}
