/**
 * Provider-agnostic detection of "no artwork" fillers: solid-colour tiles
 * (ScreenScraper) and low-complexity generic icons on flat fields (Geedie
 * backpack glyph, etc.). Pixel statistics only — no provider id literals.
 */

const MISSING_ART_URL =
  /no[-_]?image|image[-_]?not[-_]?available|no[-_]?art(?:work)?|missing[-_]?cover/i;

/**
 * URL path/name signals "catalog has no artwork" — not a corrupt download.
 * Also rejects provider-relative paths stored as site-root URLs (only `/uploads/`
 * are valid localized assets on this app).
 */
export function isMissingArtImageUrl(url?: string | null): boolean {
  if (!url?.trim()) return false;
  const pathOnly = url.split("?")[0]?.split("#")[0] ?? "";
  if (MISSING_ART_URL.test(pathOnly)) return true;
  if (pathOnly.startsWith("/") && !pathOnly.startsWith("/uploads/")) {
    return true;
  }
  return false;
}

export type PlaceholderCoverSignals = {
  entropy?: number | null;
  maxColorStdev?: number | null;
  width?: number | null;
  height?: number | null;
  meanLuminance?: number | null;
  darkPixelRatio?: number | null;
};

/** @deprecated Use {@link isPlaceholderCoverImage}. */
export function isDegenerateFlatImage(stats: {
  entropy: number;
  maxColorStdev: number;
}): boolean {
  return isPlaceholderCoverImage(stats);
}

/**
 * Full detection when sharp stats (and optionally exposure) are available —
 * used at enrichment after download.
 */
export function isPlaceholderCoverImage(
  signals: PlaceholderCoverSignals,
): boolean {
  const entropy = signals.entropy;
  const maxColorStdev = signals.maxColorStdev;

  if (
    entropy != null &&
    maxColorStdev != null &&
    entropy < 1 &&
    maxColorStdev < 10
  ) {
    return true;
  }

  const width = signals.width;
  const height = signals.height;
  if (!width || !height || width < 1 || height < 1) return false;

  const shortest = Math.min(width, height);
  const aspect = width / height;
  const meanLuminance = signals.meanLuminance;
  const darkPixelRatio = signals.darkPixelRatio;

  // Generic glyph on a flat bright tile (e.g. Geedie 500×500 when no catalog art).
  if (
    shortest <= 640 &&
    aspect >= 0.9 &&
    aspect <= 1.11 &&
    entropy != null &&
    entropy < 1.2 &&
    maxColorStdev != null &&
    maxColorStdev < 15 &&
    meanLuminance != null &&
    meanLuminance >= 170 &&
    darkPixelRatio != null &&
    darkPixelRatio < 0.04
  ) {
    return true;
  }

  return false;
}

/**
 * Read-path filter for attachments that already carry persisted image metrics
 * (no file I/O). Catches placeholders enriched before the full-stats rule shipped.
 */
export function isPlaceholderCoverFromPersistedMetrics(
  signals: PlaceholderCoverSignals,
): boolean {
  const width = signals.width;
  const height = signals.height;
  if (!width || !height || width < 1 || height < 1) return false;

  const shortest = Math.min(width, height);
  const aspect = width / height;
  const meanLuminance = signals.meanLuminance;
  const darkPixelRatio = signals.darkPixelRatio;

  return (
    shortest <= 640 &&
    aspect >= 0.9 &&
    aspect <= 1.11 &&
    meanLuminance != null &&
    meanLuminance >= 170 &&
    darkPixelRatio != null &&
    darkPixelRatio < 0.04
  );
}

export function filterPlaceholderCoverAttachments<
  T extends PlaceholderCoverSignals & { url?: string | null },
>(attachments: T[]): T[] {
  return attachments.filter(
    (attachment) =>
      !isMissingArtImageUrl(attachment.url) &&
      !isPlaceholderCoverFromPersistedMetrics(attachment),
  );
}
