import { detectPlatformKey } from "@/core/identify/query";
import { getTheGamesDbPlatformId } from "@/core/identify/platforms/platforms";

export function resolveTheGamesDbPlatformId(
  platform?: string | null,
): number | null {
  if (!platform?.trim()) return null;
  const platformKey = detectPlatformKey(platform);
  if (!platformKey) return null;
  return getTheGamesDbPlatformId(platformKey);
}
