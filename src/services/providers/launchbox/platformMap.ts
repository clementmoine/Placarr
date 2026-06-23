import {
  normalizeVideoGamePlatformText,
  resolveLaunchBoxPlatformNames,
} from "@/lib/videoGamePlatforms";

export { resolveLaunchBoxPlatformNames };

export function platformMatchesLaunchBoxEntry(
  requestedPlatform: string | null | undefined,
  entryPlatform: string,
): boolean {
  const candidates = resolveLaunchBoxPlatformNames(requestedPlatform);
  if (candidates.length === 0) return true;
  const normalizedEntry = normalizeVideoGamePlatformText(entryPlatform);
  return candidates.some(
    (candidate) =>
      normalizeVideoGamePlatformText(candidate) === normalizedEntry,
  );
}
