import { normalizeForTokens } from "@/core/barcode/titleUtils";
import {
  createDisplayTitleNoiseMatcher,
  createDisplayTitleSuffixNoiseMatcher,
} from "@/core/barcode/listingTerms";
import {
  preferredLanguage,
  titleLanguagePreference,
  type LocalePreferenceOptions,
} from "@/core/locale/preference";
import {
  createVideoGamePlatformMatcher,
  VIDEO_GAME_PLATFORM_TERMS,
} from "@/core/games/platforms";

const DISPLAY_MARKETPLACE_NOISE = createDisplayTitleNoiseMatcher();
const DISPLAY_SUFFIX_NOISE = createDisplayTitleSuffixNoiseMatcher();
const TRAILING_PLATFORM_SUFFIX = createVideoGamePlatformMatcher("i");

function testSharedPattern(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleStartsWithPlatformPrefix(name: string): boolean {
  const trimmed = name.trim();
  for (const term of [...VIDEO_GAME_PLATFORM_TERMS].sort(
    (a, b) => b.length - a.length,
  )) {
    const pattern = new RegExp(
      `^${term.split(/\s+/).map(escapeRegExp).join("\\s+")}(?:\\s|$)`,
      "i",
    );
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

function catalogReferenceTokenPenalty(title: string): number {
  return title
    .split(/[\s?\-–—:]+/)
    .filter(Boolean)
    .reduce((penalty, token) => {
      if (
        /^[A-Z0-9]{5,}$/.test(token) &&
        /[A-Z]/.test(token) &&
        /\d/.test(token)
      ) {
        return penalty + 220;
      }
      return penalty;
    }, 0);
}

export function hasCatalogReferenceListingNoise(title: string): boolean {
  return catalogReferenceTokenPenalty(title) > 0;
}

export function getRepresentativeScore(
  name: string,
  priority: number,
  options?: LocalePreferenceOptions,
): number {
  let score = priority * 1000;
  const normalized = normalizeForTokens(name);

  const words = name.split(/\s+/).filter((word) => /[A-Za-z]/.test(word));
  if (words.length >= 2) {
    const capitalised = words.filter((word) =>
      /^[^a-z]*[A-Z]/.test(word),
    ).length;
    const casedRatio = capitalised / words.length;
    if (casedRatio >= 0.6) score += 60;
    else if (casedRatio === 0) score -= 60;
  }

  if (name.includes(":") || name.includes(" - ")) {
    score += 100;
  }

  if (/![\s!]/.test(name)) {
    score += 80;
  }

  if (name.includes("&")) {
    score += 45;
  }

  // Language preference is locale-driven (default: app-wide order), never a
  // hardcoded language. Callers on deterministic paths (barcode compile,
  // storage-time merge) pass no options so cached results stay locale-free.
  const language = titleLanguagePreference(name, options);
  if (language.hasPreferredOrthography) {
    score += 50;
  }

  if (language.matchesPreferredLanguage) {
    score += 30;
  }

  if (testSharedPattern(DISPLAY_MARKETPLACE_NOISE, normalized)) {
    score -= 420;
  }

  if (
    priority >= 1 &&
    (language.hasPreferredOrthography || language.matchesPreferredLanguage)
  ) {
    score += 1500;
  }

  if (name.length <= 3) {
    score -= 20;
  }

  return score;
}

export type DisplayTitleScoreFlags = {
  isCanonical?: boolean;
  isTrustedRetailer?: boolean;
};

export function scoreDisplayTitle(
  name: string,
  flags: DisplayTitleScoreFlags | boolean = false,
  options?: LocalePreferenceOptions,
): number {
  const isCanonical = typeof flags === "boolean" ? flags : !!flags?.isCanonical;
  const isTrustedRetailer =
    typeof flags === "boolean" ? false : !!flags?.isTrustedRetailer;
  const normalized = normalizeForTokens(name);
  let score = getRepresentativeScore(name, 1, options);

  if (isCanonical) score += 120;
  if (isTrustedRetailer) score += 95;
  if (name.includes("&")) score += 180;
  if (/\b(19|20)\d{2}\b/.test(normalized)) score -= 90;
  if (testSharedPattern(DISPLAY_SUFFIX_NOISE, normalized)) {
    score -= 360;
  }

  if (titleStartsWithPlatformPrefix(name)) {
    score -= 420;
  }

  const trailingSegment =
    name
      .split(/\s[-–—]\s*/)
      .pop()
      ?.trim() ?? "";
  if (
    trailingSegment &&
    testSharedPattern(TRAILING_PLATFORM_SUFFIX, trailingSegment)
  ) {
    score -= 500;
  }

  const letters = name.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length >= 8 && letters === letters.toUpperCase()) {
    score -= 120;
  }

  // Non-Latin scripts read as foreign only relative to the preferred
  // language's script \u2014 derived from the locale, not an absolute judgement.
  const hasCjk =
    /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf\uac00-\ud7af]/.test(
      name,
    );
  if (hasCjk && titleLanguagePreference(name, options).prefersLatinScript) {
    score -= 200;
  }

  score -= catalogReferenceTokenPenalty(name);

  return score;
}

export function normalizeDisplayTitle(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(
      (token) =>
        token.length > 2 &&
        !["and", "the", "aux", "des", "les", "une", "pour"].includes(token),
    );
}

export function areDisplayTitlesSameProduct(a: string, b: string): boolean {
  const aTokens = normalizeDisplayTitle(a);
  const bTokens = normalizeDisplayTitle(b);
  if (aTokens.length === 0 || bTokens.length === 0) return false;

  const shared = aTokens.filter((token) => bTokens.includes(token));
  return shared.length >= Math.min(2, Math.min(aTokens.length, bTokens.length));
}

export function requestedTitleCoversCurrentTitle(
  requested: string,
  current: string,
): boolean {
  const requestedTokens = new Set(normalizeDisplayTitle(requested));
  const currentTokens = normalizeDisplayTitle(current);
  if (requestedTokens.size === 0 || currentTokens.length === 0) return false;

  return currentTokens.every((token) => requestedTokens.has(token));
}

export function scoreMetadataDisplayTitle(
  title: string,
  options?: LocalePreferenceOptions,
): number {
  const normalized = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  let score = 0;

  const language = titleLanguagePreference(title, options);
  if (title.includes("&")) score += 45;
  if (language.hasPreferredOrthography) score += 25;
  if (language.matchesPreferredLanguage) score += 40;
  if (/\b(19|20)\d{2}\b/.test(normalized)) score -= 60;
  if (testSharedPattern(DISPLAY_SUFFIX_NOISE, normalized)) {
    score -= 120;
  }

  const hasCjk =
    /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf\uac00-\ud7af]/.test(
      title,
    );
  if (hasCjk && language.prefersLatinScript) {
    score -= 200;
  }

  score -= catalogReferenceTokenPenalty(title);

  return score;
}

export function pickBestCatalogDisplayTitle(
  candidates: Array<string | null | undefined>,
  options?: LocalePreferenceOptions,
): string | undefined {
  const unique = Array.from(
    new Set(
      candidates
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim()),
    ),
  );
  if (unique.length === 0) return undefined;
  if (unique.length === 1) return unique[0];

  return unique.sort((a, b) => {
    const scoreDiff =
      scoreDisplayTitle(b, false, options) -
      scoreDisplayTitle(a, false, options);
    if (scoreDiff !== 0) return scoreDiff;
    return a.localeCompare(b, preferredLanguage(options));
  })[0];
}
