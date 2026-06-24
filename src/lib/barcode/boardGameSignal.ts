import type { BarcodeLookupPayload } from "@/lib/barcode/lookupPayload";
import { normalizeForTokens } from "@/lib/barcode/titleUtils";

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

// Board-game publishers that do NOT also publish video games (keeps precision
// high — Hasbro/Ravensburger etc. are intentionally excluded as ambiguous).
const PUBLISHERS = [
  "gigamic",
  "asmodee",
  "days of wonder",
  "repos production",
  "iello",
  "matagot",
  "libellud",
  "space cowboys",
  "bombyx",
  "blue orange",
  "cocktail games",
  "le scorpion masque",
  "funforge",
  "catch up games",
  "blackrock games",
  "ludonaute",
  "helvetiq",
  "pixie games",
  "lumberjacks",
  "oka luda",
  "sit down",
  "blue cocker",
  "grrre games",
];

const CATEGORY_STRENGTH = 1;
const PUBLISHER_STRENGTH = 0.6;

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
  return normalizeForTokens(value).replace(/[^a-z0-9]+/g, " ").trim();
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
 * Returns a 0..1 board-game signal strength from a set of listing/title names.
 * Strongest hit wins (a category phrase outweighs a lone publisher mention).
 */
export function detectBoardGameSignal(names: string[]): number {
  let strength = 0;
  for (const raw of names) {
    if (!raw) continue;
    const normalized = normalizeName(raw);
    if (!normalized) continue;
    if (CATEGORY_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return CATEGORY_STRENGTH; // can't get stronger; short-circuit
    }
    if (PUBLISHERS.some((publisher) => normalized.includes(publisher))) {
      strength = Math.max(strength, PUBLISHER_STRENGTH);
    }
  }
  return strength;
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

  pushListings(payload.amc);
  pushListings(payload.picclick);
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
