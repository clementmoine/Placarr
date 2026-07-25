/**
 * Franchise sequel number conflict / alignment for game title matching.
 */
import { containsGameOfTheYearEdition } from "@/core/identify/listingTerms";
import {
  explicitVolumeNumbers,
  normalizeVolumeNumber,
  normalizeVolumeTitleText,
} from "@/core/enrich/titles/volumeNumber";
import { parseRomanToken } from "@/core/enrich/titles/romanNumeral";
import { normalizeForTokens } from "@/core/enrich/titles/normalize";
import { createSequelNumberBeforePlatformMatcher } from "@/core/identify/platforms/platforms";

const SEQUEL_NUMBER_BEFORE_PLATFORM_MATCHER =
  createSequelNumberBeforePlatformMatcher("gi");

function pushFranchiseSequelNumber(target: string[], raw: string | undefined) {
  if (!raw) return;
  const normalized = normalizeVolumeNumber(raw);
  if (normalized === "NaN") return;
  target.push(normalized);
}

function pushFranchiseSequelRoman(
  target: string[],
  raw: string | undefined,
): void {
  if (!raw) return;
  const value = parseRomanToken(raw);
  if (value == null) return;
  target.push(String(value));
}

function isGalleryIndexCaption(title: string): boolean {
  const normalized = normalizeVolumeTitleText(title);
  return /\b(gameplay|screenshot|capture|screen|image|visuel|photo)\s+\d{1,2}\s*$/.test(
    normalized,
  );
}

/** Xbox Series X/S — standalone "x" is a platform token, not sequel X (10). */
function stripPlatformRomanNoisePhrases(value: string): string {
  return value
    .replace(/\bxbox\s+series\s+x(?:\s+one|\s*\/\s*s)?\b/gi, "xbox series")
    .replace(/\bseries\s+x(?:\s+one|\s*\/\s*s)?\b/gi, "series");
}

/** Sequel markers in game franchises ("Baldur's Gate 3", "Resident Evil 2"). */
export function franchiseSequelTokens(title: string): string[] {
  const separatorSource = normalizeForTokens(title).replace(/[’‘']/g, "'");
  const text = normalizeVolumeTitleText(title);
  if (!text && !separatorSource) return [];

  const romanText = stripPlatformRomanNoisePhrases(text);
  const romanSeparator = stripPlatformRomanNoisePhrases(separatorSource);

  const numbers: string[] = [];
  if (!isGalleryIndexCaption(title)) {
    for (const match of text.matchAll(
      /\b(\d{1,2})\s*(?=$|\s+(?:deluxe|limited|edition|goty|complete|definitive|ultimate|standard|collection|bundle|remastered|remaster|director|anniversary|gold|platinum|game of the year))\b/gi,
    )) {
      pushFranchiseSequelNumber(numbers, match[1]);
    }
  }

  for (const match of separatorSource.matchAll(
    /\b(\d{1,2})\s*(?::|(?:-\s))/g,
  )) {
    pushFranchiseSequelNumber(numbers, match[1]);
  }

  for (const match of romanText.matchAll(
    /\b(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\b/gi,
  )) {
    pushFranchiseSequelRoman(numbers, match[1]);
  }

  for (const match of romanSeparator.matchAll(
    /\b(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\s*(?::|(?:-\s))/gi,
  )) {
    pushFranchiseSequelRoman(numbers, match[1]);
  }

  // "Borderlands 3 PS4", "Tekken 7 sur PS4", "Halo 4 Xbox One"
  for (const match of text.matchAll(SEQUEL_NUMBER_BEFORE_PLATFORM_MATCHER)) {
    pushFranchiseSequelNumber(numbers, match[1]);
  }

  // "Borderlands 3 [Deluxe Edition]"
  for (const match of text.matchAll(/\b(\d{1,2})\s*(?=\s*[\[(])/g)) {
    pushFranchiseSequelNumber(numbers, match[1]);
  }

  // "Burnout 3 Takedown" / "Burnout 3 TakeDown" — installment before a subtitle
  // word. Without this, only the colon form ("Burnout 3: Takedown") yields a
  // sequel token and shelf titles without ":" false-conflict against catalog.
  // Skip quantity/edition tails ("Trilogy: 3 Full Games", "3 Deluxe Edition").
  for (const match of text.matchAll(
    /\b(\d{1,2})\s+(?!(?:full|games?|discs?|vols?|volumes?|pack|in|deluxe|limited|edition|goty|complete|definitive|ultimate|standard|collection|bundle|remastered|remaster|director|anniversary|gold|platinum|game of the year)\b)(?=[a-z\u00c0-\u024f])/gi,
  )) {
    pushFranchiseSequelNumber(numbers, match[1]);
  }

  return Array.from(new Set(numbers));
}

export function franchiseSequelNumbersAreAligned(
  candidateTitle: string,
  comparisonNames: string[],
): boolean {
  const requestedExplicit = Array.from(
    new Set(comparisonNames.flatMap(explicitVolumeNumbers)),
  );
  // Numbered albums/volumes (n°, Tome, Vol.) are handled by editionNumbersAreAligned.
  if (requestedExplicit.length > 0) return true;

  const requested = Array.from(
    new Set(comparisonNames.flatMap(franchiseSequelTokens)),
  );
  if (requested.length === 0) return true;

  const candidate = franchiseSequelTokens(candidateTitle);
  if (candidate.length === 0) {
    const sharesGoty =
      containsGameOfTheYearEdition(candidateTitle) &&
      comparisonNames.some(containsGameOfTheYearEdition);
    return sharesGoty;
  }

  const requestedSet = new Set(requested);
  return candidate.some((number) => requestedSet.has(number));
}

/** True when the catalog names a sequel the request did not ask for, or both name sequels that disagree. */
export function franchiseSequelNumbersConflict(
  requestedNames: string[],
  catalogTitle: string,
): boolean {
  const requestedExplicit = Array.from(
    new Set(requestedNames.flatMap(explicitVolumeNumbers)),
  );
  // Numbered albums/volumes (n°, Tome, Vol.) are edition identity — same
  // deferral as franchiseSequelNumbersAreAligned.
  if (requestedExplicit.length > 0) return false;

  const catalogExplicit = explicitVolumeNumbers(catalogTitle);
  const requested = Array.from(
    new Set(requestedNames.flatMap(franchiseSequelTokens)),
  );
  const catalog = franchiseSequelTokens(catalogTitle);
  if (catalog.length === 0) return false;
  // Catalog "Wakfu, Tome 3 : …" injects "3" via the "N :" franchise pattern.
  // A bare request ("WAKFU 3 Les Mines…") has no franchise tokens yet — that is
  // not a sequel conflict; title score / album tokens decide.
  if (catalogExplicit.length > 0 && requested.length === 0) return false;
  if (requested.length === 0) return true;

  const requestedSet = new Set(requested);
  return !catalog.some((number) => requestedSet.has(number));
}
