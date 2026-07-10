import {
  detectVideoGamePlatformKey,
  isVideoGamePlatformKey,
} from "@/core/identify/platforms/platforms";

function normalizeMetadataPlatformKey(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (isVideoGamePlatformKey(trimmed)) return trimmed;
  return detectVideoGamePlatformKey(trimmed);
}

/**
 * Whether a provider-discovered barcode may be adopted on a platform-specific
 * games shelf. Unknown-platform EANs are rejected rather than risk pinning
 * another console's barcode. The user's own scan is ground truth (caller skips
 * this gate when the scanned barcode matches).
 */
export function discoveredBarcodeMatchesRequestedPlatform(
  metadata: { platformKey?: string | null },
  requestedPlatformKey?: string | null,
): boolean {
  const requested = normalizeMetadataPlatformKey(requestedPlatformKey ?? null);
  if (!requested || !isVideoGamePlatformKey(requested)) return true;
  return normalizeMetadataPlatformKey(metadata.platformKey) === requested;
}
