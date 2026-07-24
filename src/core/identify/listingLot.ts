/**
 * Marketplace multi-item lots — structural count/range rules, not product vocabulary.
 */
import {
  LISTING_LOT_PLURAL_BOOK_NOUNS,
  LISTING_LOT_PLURAL_GAME_NOUNS,
} from "@/core/identify/listingTerms";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function joinAlternation(terms: readonly string[]): string {
  return [...terms]
    .map(escapeRegExp)
    .sort((a, b) => b.length - a.length)
    .join("|");
}

const GAME_PLURAL_ALT = joinAlternation(LISTING_LOT_PLURAL_GAME_NOUNS);
const BOOK_PLURAL_ALT = joinAlternation(LISTING_LOT_PLURAL_BOOK_NOUNS);

/**
 * A marketplace "lot": a single listing selling several games together
 * ("Teenage Mutant Ninja Turtles 1,2,3 NES", "Lot de 3 jeux", "Spyro 1 2 3").
 * Such a listing does not identify the one product a barcode is for, and its
 * name collapses to a bare franchise that out-ranks the real edition, so it must
 * be discarded before it enters resolution. Run on the RAW listing name (the
 * number run is stripped during cleaning). Deliberately conservative — official
 * collections name themselves "Trilogy"/"1 + 2", which this does NOT match.
 */
export function isLotListing(name: string): boolean {
  const n = ` ${name.toLowerCase()} `;
  // Explicit lot vocabulary.
  if (/\blot\s+(de\b|d['’]|of\b)/.test(n)) return true;
  if (/\bbundle\b/.test(n) && /(\d|\bjeux\b|\bgames\b|\bjuegos\b)/.test(n)) {
    return true;
  }
  // A quantity of (plural) games: "3 jeux", "2 games". Singular "game"/"jeu"
  // is excluded so a sequel like "Resident Evil 2 game" is kept.
  if (
    new RegExp(`\\b(?:[2-9]|[1-9]\\d+)\\s*(?:${GAME_PLURAL_ALT})\\b`).test(n)
  ) {
    return true;
  }
  // Manga/comics multi-volume lots ("5 MANGA …", "Tomes 1 à 9", box sets).
  if (
    new RegExp(`\\b(?:[2-9]|[1-9]\\d+)\\s+(?:${BOOK_PLURAL_ALT})\\b`).test(n)
  ) {
    return true;
  }
  if (/\btomes?\s+\d+\s*(?:à|a|to|-)\s*\d+\b/.test(n)) return true;
  if (/\btomes?\s+\d+\s*(?:et|&)\s*\d+\b/.test(n)) return true;
  if (/\bvol\.?\s*\d+\s*-\s*\d+\b/.test(n)) return true;
  if (/\bn[°º]?\s*\d+\s*-\s*\d+\b/.test(n)) return true;
  if (/\bbox\s+set\b/.test(n)) return true;
  if (/\bcoffret\b/.test(n) && /\b(?:tomes?|vol\.?|n[°º])\s*\d/.test(n)) {
    return true;
  }
  // A run of installment numbers: "… 1,2,3" / "… 1, 2" / "Spyro 1 2 3".
  if (/[1-9]\s*,\s*[1-9](?:\s*,\s*[1-9])*/.test(n)) return true;
  if (/\b[1-9]\s+[1-9]\s+[1-9]\b/.test(n)) return true;
  return false;
}
