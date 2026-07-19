/**
 * Whole dash-segment listing metadata — exact phrases from shared taxonomies,
 * plus a few structural platform/packaging compounds.
 */
import { normalizeForTokens } from "@/core/enrich/titles/normalize";
import {
  GAME_EDITION_TERMS,
  LISTING_CONDITION_TERMS,
  LISTING_EDITION_PACKAGING_EXTRA_TERMS,
  LISTING_FORMAT_TERMS,
  LISTING_NOISE_TERMS,
  LISTING_PUBLISHER_SUFFIX_TERMS,
  LISTING_REGION_TERMS,
} from "@/core/identify/listingTerms";
import { VIDEO_GAME_PLATFORM_TERMS } from "@/core/identify/platforms/platforms";
import {
  ERA_ADJECTIVE_SEGMENT_RE,
  MEDIA_CATEGORY_SEGMENT_RE,
  PLATFORM_GENERATION_SEGMENT_RE,
  REGION_COMPOUND_SEGMENT_RE,
} from "@/core/identify/listingChrome";

function normalizeMetadataSegment(value: string): string {
  return normalizeForTokens(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LISTING_METADATA_SEGMENT_PHRASES: ReadonlySet<string> = new Set(
  [
    ...LISTING_PUBLISHER_SUFFIX_TERMS,
    ...LISTING_REGION_TERMS,
    ...LISTING_CONDITION_TERMS,
    ...LISTING_FORMAT_TERMS,
    ...LISTING_NOISE_TERMS,
    ...LISTING_EDITION_PACKAGING_EXTRA_TERMS,
    ...GAME_EDITION_TERMS,
    ...VIDEO_GAME_PLATFORM_TERMS,
  ]
    .map(normalizeMetadataSegment)
    .filter(Boolean),
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PLATFORM_ALT = [...VIDEO_GAME_PLATFORM_TERMS]
  .map((term) =>
    normalizeMetadataSegment(term)
      .split(/\s+/)
      .map(escapeRegExp)
      .join("\\s+"),
  )
  .filter(Boolean)
  .sort((a, b) => b.length - a.length)
  .join("|");

/** "jeux wii", "jeu nintendo gamecube", … */
const JEUX_PLATFORM_SEGMENT_RE = new RegExp(
  `^jeux?\\s+(?:nintendo\\s+)?(?:${PLATFORM_ALT})$`,
  "i",
);

/** "nintendo wii" when the platform term alone is already covered by the set. */
const NINTENDO_PLATFORM_SEGMENT_RE = new RegExp(
  `^nintendo\\s+(?:${PLATFORM_ALT})$`,
  "i",
);

const SINGLE_TOKEN_FORMAT: ReadonlySet<string> = new Set(
  LISTING_FORMAT_TERMS.map(normalizeMetadataSegment).filter(
    (term) => term && !term.includes(" "),
  ),
);

/** "album cd" / "cd album" — every token is a format carrier. */
function segmentIsFormatTokenCombo(normalized: string): boolean {
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  return tokens.every((token) => SINGLE_TOKEN_FORMAT.has(token));
}

export function isListingMetadataSegment(segment: string): boolean {
  const normalized = normalizeMetadataSegment(segment);
  if (!normalized) return true;

  if (LISTING_METADATA_SEGMENT_PHRASES.has(normalized)) return true;
  if (segmentIsFormatTokenCombo(normalized)) return true;
  if (PLATFORM_GENERATION_SEGMENT_RE.test(normalized)) return true;
  if (ERA_ADJECTIVE_SEGMENT_RE.test(normalized)) return true;
  if (MEDIA_CATEGORY_SEGMENT_RE.test(normalized)) return true;
  if (REGION_COMPOUND_SEGMENT_RE.test(normalized)) return true;
  if (JEUX_PLATFORM_SEGMENT_RE.test(normalized)) return true;
  if (NINTENDO_PLATFORM_SEGMENT_RE.test(normalized)) return true;
  // Composite chrome still seen as a single dash segment.
  if (/\bjeu\b.*\bnotice\b/.test(normalized)) return true;

  return false;
}
