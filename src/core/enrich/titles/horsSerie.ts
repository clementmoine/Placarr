import { volumeNumberFromTitle } from "@/core/enrich/titles/volumeNumber";

/**
 * "Hors-série" marks a special issue published outside a series' regular
 * numbering (French publishing vocabulary, like "Tome" — never a product
 * name). Catalogs code these issues HS ("HS-SPM1") and their position can
 * never be matched against a regular issue number.
 */
const HORS_SERIE_MARKER_RE = /\bhors[\s._-]*s[ée]rie\b/i;

export function hasHorsSerieMarker(value: string): boolean {
  return HORS_SERIE_MARKER_RE.test(value);
}

/**
 * Series name before the hors-série marker:
 * "Super Picsou Géant - Hors-Série - Picsou …" → "Super Picsou Géant".
 * Null when the marker is absent or leads the title.
 */
export function horsSerieSeriesPart(value: string): string | null {
  const match = value.match(HORS_SERIE_MARKER_RE);
  if (!match || match.index === undefined) return null;
  const before = value
    .slice(0, match.index)
    .replace(/[\s:–—-]+$/g, "")
    .trim();
  return before || null;
}

/** Subtitle after the hors-série marker (e.g. « Picsou - Des souvenirs… »). */
export function horsSerieSubtitle(value: string): string | null {
  const match = value.match(HORS_SERIE_MARKER_RE);
  if (!match || match.index === undefined) return null;
  const subtitle = value
    .slice(match.index + match[0].length)
    .replace(/^[\s:–—-]+/, "")
    .trim();
  return subtitle || null;
}

/**
 * Volume marker inside the hors-série subtitle only — never the series'
 * regular n°N. Used to route multi-tome HS sub-series before the main line.
 */
export function horsSerieSubtitleIssueNumber(value: string): string | null {
  const subtitle = horsSerieSubtitle(value);
  return subtitle ? volumeNumberFromTitle(subtitle) : null;
}
