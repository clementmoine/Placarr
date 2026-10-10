/**
 * Provider-agnostic detection of "no artwork" fillers: solid-colour tiles
 * (ScreenScraper) and low-complexity generic icons on flat fields (Geedie
 * backpack glyph, etc.). Pixel statistics only — no provider id literals.
 */

import { SERVED_LOCAL_PREFIXES } from "@/lib/media/servedLocalPaths";

const MISSING_ART_URL =
  /no[-_]?image|image[-_]?not[-_]?available|no[-_]?art(?:work)?|missing[-_]?cover|non[-_]?dispo(?:nible)?|visuel[-_]?non[-_]?disponible|cover[-_]?unavailable|no[-_]?cover/i;

/**
 * URL path/name signals "catalog has no artwork" — not a corrupt download.
 * Also rejects provider-relative paths stored as site-root URLs.
 */
export function isMissingArtImageUrl(url?: string | null): boolean {
  if (!url?.trim()) return false;
  const pathOnly = url.split("?")[0]?.split("#")[0] ?? "";
  if (MISSING_ART_URL.test(pathOnly)) return true;
  if (
    pathOnly.startsWith("/") &&
    !SERVED_LOCAL_PREFIXES.some((prefix) => pathOnly.startsWith(prefix))
  ) {
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
  if (isUnavailableCoverPlaceholderFromPersistedMetrics(signals)) return true;

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

/** Read-path filter for Google/marketplace "no cover" tiles with metrics. */
export function isUnavailableCoverPlaceholderFromPersistedMetrics(
  signals: PlaceholderCoverSignals,
): boolean {
  const width = signals.width;
  const height = signals.height;
  if (!width || !height) return false;

  if (width >= 100 && width <= 135 && height >= 150 && height <= 185) {
    return true;
  }

  const aspect = width / height;
  const portraitTile =
    width >= 200 &&
    width <= 320 &&
    height >= 350 &&
    height <= 450 &&
    aspect >= 0.55 &&
    aspect <= 0.75;
  if (!portraitTile) return false;

  const darkPixelRatio = signals.darkPixelRatio;
  const meanLuminance = signals.meanLuminance;

  // Dark Google-style tile.
  if (
    darkPixelRatio != null &&
    darkPixelRatio >= 0.55 &&
    (signals.entropy == null || signals.entropy < 4.5)
  ) {
    return true;
  }

  // Light marketplace tile ("Visuel non disponible").
  return (
    meanLuminance != null &&
    meanLuminance >= 200 &&
    darkPixelRatio != null &&
    darkPixelRatio < 0.05 &&
    (signals.entropy == null || signals.entropy < 5.0)
  );
}

function isBrightSquarePlaceholderFromPersistedMetrics(
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

/**
 * Light portrait "Visuel non disponible" tiles. Intentionally narrower than
 * the full unavailable-tile rule — localized dark real covers must stay.
 */
function isLightUnavailablePortraitFromPersistedMetrics(
  signals: PlaceholderCoverSignals,
): boolean {
  const width = signals.width;
  const height = signals.height;
  if (!width || !height) return false;
  const aspect = width / height;
  if (
    width < 200 ||
    width > 320 ||
    height < 350 ||
    height > 450 ||
    aspect < 0.55 ||
    aspect > 0.75
  ) {
    return false;
  }
  return (
    signals.meanLuminance != null &&
    signals.meanLuminance >= 200 &&
    signals.darkPixelRatio != null &&
    signals.darkPixelRatio < 0.05
  );
}

function isPersistedLocalizedUpload(url?: string | null): boolean {
  return Boolean(url?.startsWith("/uploads/"));
}

export function filterPlaceholderCoverAttachments<
  T extends PlaceholderCoverSignals & { url?: string | null },
>(attachments: T[]): T[] {
  return attachments.filter((attachment) => {
    if (isMissingArtImageUrl(attachment.url)) return false;
    // Localized assets skip dark Google-tile heuristics (real dark art lives
    // in /uploads/), but bright squares + light "no visual" portraits drop.
    if (isPersistedLocalizedUpload(attachment.url)) {
      return (
        !isBrightSquarePlaceholderFromPersistedMetrics(attachment) &&
        !isLightUnavailablePortraitFromPersistedMetrics(attachment)
      );
    }
    return !isPlaceholderCoverFromPersistedMetrics(attachment);
  });
}
