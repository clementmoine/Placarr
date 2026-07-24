/**
 * Strip trailing game edition qualifiers for base-title fallback lookups.
 */
import { createGameEditionMatcher } from "@/core/identify/listingTerms";

/**
 * Edition/reprint qualifiers that describe a *variant* of a game rather than a
 * distinct title. Kept deliberately narrow (strong markers only) so a real
 * subtitle is never mistaken for an edition.
 */
export const EDITION_QUALIFIER = createGameEditionMatcher("i");

/**
 * Strips a *trailing* edition qualifier so providers that only index the base
 * game can still match:
 *   "Monopoly - Editions Classique Et Monde"            -> "Monopoly"
 *   "The Legend of Zelda: Skyward Sword - Edition Lim." -> "The Legend of Zelda: Skyward Sword"
 *
 * Splits on the LAST top-level separator (a colon or a spaced dash) so a
 * meaningful subtitle ("Skyward Sword") is preserved, and only when the trailing
 * part is an edition qualifier — never a distinct subtitle. Used as a
 * last-resort fallback name, after the full title and aliases have failed.
 */
export function extractBaseTitleVariant(requestedName: string): string | null {
  const trimmed = requestedName.trim();
  // Greedy leading group => the separator captured is the last one in the title.
  const match = trimmed.match(/^(.+)(?::\s+|\s+[-–—]\s+)(\S.*)$/);
  if (match) {
    const base = match[1].trim();
    const trailing = match[2].trim();
    if (base.length < 3) return null;
    if (base.toLowerCase() === trimmed.toLowerCase()) return null;
    if (!EDITION_QUALIFIER.test(trailing)) return null;
    return base;
  }

  const trailingEdition = trimmed.match(
    /^(.+?)\s+(deluxe|collector|ultimate|legendary|premium|gold|platinum|complete|definitive|anniversary)(?:\s+edition)?$/i,
  );
  if (trailingEdition) {
    const base = trailingEdition[1].trim();
    if (base.length >= 3 && base.toLowerCase() !== trimmed.toLowerCase()) {
      return base;
    }
  }

  return null;
}

export function isGameEditionVariant(requestedName: string): boolean {
  return extractBaseTitleVariant(requestedName) !== null;
}

