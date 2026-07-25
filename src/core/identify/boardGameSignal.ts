import type { BarcodeLookupPayload } from "@/core/identify/lookup/payload";
import { normalizeForTokens } from "@/core/identify/titleUtils";
import {
  detectVideoGamePlatformKey,
  videoGamePlatformListingTypeSignal,
} from "@/core/identify/platforms/platforms";
import { makeObservationUsage } from "@/core/enrich/observations";
import type { MetadataObservation } from "@/types/metadataObservation";

/**
 * A board game scanned without a type (home-page scan → generic branch) competes
 * for classification against games/movies/books/musics. The marketplace listings
 * themselves carry a strong board-game signal — the category phrase
 * ("jeu de société") and board-game publishers ("Gigamic", "Asmodee"…). We use it
 * to bias the type scoring towards `boardgames` and away from `games`, so a
 * coincidental video-game match (e.g. PriceCharting/IGDB hitting a same-named
 * game) cannot hijack the type. See scoreTypeCandidate.
 */

// High-precision category phrases (accents stripped by normalizeForTokens).
const CATEGORY_PATTERNS = [
  /\bjeux?\s+de\s+societe\b/,
  /\bjeux?\s+de\s+plateau\b/,
  /\bboard\s?games?\b/,
];

const CATEGORY_STRENGTH = 1;

// Video-only formats / film content cues: a LaserDisc, VHS or "dessin animé" is a
// MOVIE, never a music CD — so the same harvested listings can disambiguate a
// film that a coincidental same-named soundtrack album would otherwise win.
// (DVD/Blu-ray are intentionally excluded — too ambiguous with games.)
const VIDEO_FORMAT_PATTERNS = [
  /\blaser\s?disc\b/,
  /\bvhs\b/,
  /\bdessin\s+anime\b/,
  /\blong\s+metrage\b/,
  /\bvostfr\b/,
];
const VIDEO_FORMAT_STRENGTH = 1;

function normalizeName(value: string): string {
  return normalizeForTokens(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * A video-format signal (LaserDisc/VHS/animated film) harvested from the
 * listings. Used to bias the type scoring towards `movies` and away from
 * `musics`, so a coincidental same-named soundtrack cannot hijack the type of a
 * scanned film. See scoreTypeCandidate.
 */
export function detectVideoFormatSignal(names: string[]): number {
  for (const raw of names) {
    if (!raw) continue;
    const normalized = normalizeName(raw);
    if (!normalized) continue;
    if (VIDEO_FORMAT_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return VIDEO_FORMAT_STRENGTH;
    }
  }
  return 0;
}

/**
 * A video-game signal harvested from the listings: a platform named in a listing
 * ("… Xbox", "… Nintendo NES", "… PS2") is strong evidence the physical item is a
 * video game, never a music CD or film. Used to bias the type scoring towards
 * `games` and away from `musics`/`movies`, so a coincidental same-named canonical
 * — most often a music album the DATABASE fallback fabricates from a game listing
 * name (e.g. "Ghost Recon — Classics") — cannot hijack the type of a scanned game
 * whose own canonical was demoted. See scoreTypeCandidate.
 *
 * Platforms marked `listingTypeSignalPrecision: "low"` in the platform table are
 * skipped — their token can appear outside video-game contexts.
 */
export function detectVideoGameSignal(names: string[]): number {
  for (const raw of names) {
    if (!raw) continue;
    const key = detectVideoGamePlatformKey(raw);
    if (videoGamePlatformListingTypeSignal(key) > 0) return 1;
  }
  return 0;
}

// Physical media format → display label, most specific first. The label doubles
// as a shelf-name hint (a "LaserDisc"/"VHS" scan should be recommended to the
// matching shelf), which the cleaned title no longer carries since the format
// word is stripped. DVD/Blu-ray are kept here (unlike the type signal) because
// at shelf-suggestion time the media type is already decided.
const MEDIA_FORMAT_LABELS: Array<[RegExp, string]> = [
  [/\blaser\s?disc\b/, "LaserDisc"],
  [/\bvhs\b/, "VHS"],
  [/\bblu\s?-?\s?ray\b/, "Blu-ray"],
  [/\bdvd\b/, "DVD"],
];

/** The physical format named by the listings ("LaserDisc", "VHS"…), or null. */
export function detectMediaFormat(names: string[]): string | null {
  const normalized = names.map((name) => normalizeName(name)).filter(Boolean);
  for (const [pattern, label] of MEDIA_FORMAT_LABELS) {
    if (normalized.some((name) => pattern.test(name))) return label;
  }
  return null;
}

/**
 * Returns a 0..1 board-game signal strength from a set of listing/title names,
 * based only on GENERIC category phrases ("jeu de société", "board game"). The
 * old hand-maintained publisher list was removed: a publisher is a never-complete
 * entity list. The authoritative replacement is provider-as-signal — a board-game
 * SPECIALIST source identifying the barcode — computed from the registry in
 * `barcodeResolver` (see `detectSpecialistSignal`), not from names.
 */
export function detectBoardGameSignal(names: string[]): number {
  for (const raw of names) {
    if (!raw) continue;
    const normalized = normalizeName(raw);
    if (!normalized) continue;
    if (CATEGORY_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return CATEGORY_STRENGTH;
    }
  }
  return 0;
}

/** Gather every name a barcode lookup harvested, for signal detection. */
export function collectPayloadListingNames(
  payload: BarcodeLookupPayload,
): string[] {
  const names: string[] = [];
  const pushListings = (listings: { name: string }[]) => {
    for (const listing of listings) {
      if (listing?.name) names.push(listing.name);
    }
  };
  const pushCatalogHints = (
    listings: Array<{ category?: string | null; brand?: string | null }>,
  ) => {
    for (const listing of listings) {
      if (listing.category?.trim()) names.push(listing.category.trim());
      if (listing.brand?.trim()) names.push(listing.brand.trim());
    }
  };

  pushListings(payload.amc);
  pushCatalogHints(payload.amc);
  pushListings(payload.ebay);
  pushListings(payload.freakxy);
  pushListings(payload.calGeneric);
  pushListings(payload.calToys);

  if (payload.philibert?.title) names.push(payload.philibert.title);
  for (const retailer of payload.retailers) {
    if (retailer.title) names.push(retailer.title);
  }
  if (payload.leDenicheur?.productName) {
    names.push(payload.leDenicheur.productName);
  }

  return names;
}

/** Brand / category clues from marketplace listings for shelf estimation. */
export function collectPayloadShelfHints(
  payload: BarcodeLookupPayload,
): string[] {
  const hints: string[] = [];
  const push = (value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    if (hints.some((hint) => hint.toLowerCase() === trimmed.toLowerCase())) {
      return;
    }
    hints.push(trimmed);
  };

  for (const listing of payload.amc || []) {
    push(listing.category);
    push(listing.brand);
  }
  return hints;
}

/** Persist format/brand shelf clues as non-display fact observations. */
export function shelfHintObservationsFromHints(
  hints: string[],
  mediaFormat?: string | null,
): MetadataObservation[] {
  return hints.map((hint) => {
    const isFormatHint =
      mediaFormat != null && hint.toLowerCase() === mediaFormat.toLowerCase();
    return {
      kind: "fact" as const,
      role: "listing_fact" as const,
      factKind: isFormatHint ? "media-format" : "brand",
      label: isFormatHint ? "Format" : "Marque",
      value: hint,
      provenance: {
        providerId: "marketplace",
        providerLabel: "Marketplace",
        sourceDocumentRole: "structured_data" as const,
        evidenceSignals: ["structured_data" as const, "barcode_match" as const],
      },
      usage: makeObservationUsage({
        displayCandidate: false,
        searchAlias: isFormatHint ? "none" : "weak",
        evidence: "strong",
      }),
    };
  });
}
