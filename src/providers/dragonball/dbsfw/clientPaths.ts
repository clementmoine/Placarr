/**
 * Optional local Mac install path for Fusion World Addressables.
 * Sync prefers CDN staging (`cdn/ensureClient`) — this is a fallback only.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DBS_FW_STANDALONE_OSX_REL = join(
  "Library/Application Support/DBSCG FW/Games",
  "DRAGON BALL SUPER CARD GAME FUSION WORLD/default/game/DBSCGFW.app",
  "Contents/Resources/Data/StreamingAssets/aa/StandaloneOSX",
);

export function fusionWorldStandaloneOsxBundlesDir(
  home: string = homedir(),
): string {
  return join(home, DBS_FW_STANDALONE_OSX_REL);
}

export function fusionWorldClientBundlesPresent(
  bundlesDir: string = fusionWorldStandaloneOsxBundlesDir(),
): boolean {
  return existsSync(bundlesDir);
}
