import { detectPlatformKey } from "@/lib/barcode/query";
import { getTheGamesDbPlatformId } from "@/lib/videoGamePlatforms";

export function resolveTheGamesDbPlatformId(
  platform?: string | null,
): number | null {
  if (!platform?.trim()) return null;
  const platformKey = detectPlatformKey(platform);
  if (!platformKey) return null;
  return getTheGamesDbPlatformId(platformKey);
}
