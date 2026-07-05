import { detectPlatformKey } from "@/core/barcode/query";
import { getTheGamesDbPlatformId } from "@/core/games/platforms";

export function resolveTheGamesDbPlatformId(
  platform?: string | null,
): number | null {
  if (!platform?.trim()) return null;
  const platformKey = detectPlatformKey(platform);
  if (!platformKey) return null;
  return getTheGamesDbPlatformId(platformKey);
}
