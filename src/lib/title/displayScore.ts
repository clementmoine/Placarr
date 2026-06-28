import { normalizeForTokens } from "@/lib/barcode/titleUtils";
import {
  createDisplayTitleNoiseMatcher,
  createDisplayTitleSuffixNoiseMatcher,
} from "@/lib/barcode/listingTerms";
import { inferTextLanguage } from "@/lib/locale/preference";
import {
  createVideoGamePlatformMatcher,
  VIDEO_GAME_PLATFORM_TERMS,
} from "@/lib/games/platforms";

const DISPLAY_MARKETPLACE_NOISE = createDisplayTitleNoiseMatcher();
const DISPLAY_SUFFIX_NOISE = createDisplayTitleSuffixNoiseMatcher();
const TRAILING_PLATFORM_SUFFIX = createVideoGamePlatformMatcher("i");

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

export function getRepresentativeScore(name: string, priority: number): number {
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

  const hasAccents = /[éèàùçêâôîëïüû]/.test(name.toLowerCase());
  if (hasAccents) {
    score += 50;
  }

  const isFrench = inferTextLanguage(name) === "fr";
  if (isFrench) {
    score += 30;
  }

  if (DISPLAY_MARKETPLACE_NOISE.test(normalized)) {
    score -= 420;
  }

  if (priority >= 1 && (hasAccents || isFrench)) {
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
): number {
  const isCanonical = typeof flags === "boolean" ? flags : !!flags?.isCanonical;
  const isTrustedRetailer =
    typeof flags === "boolean" ? false : !!flags?.isTrustedRetailer;
  const normalized = normalizeForTokens(name);
  let score = getRepresentativeScore(name, 1);

  if (isCanonical) score += 120;
  if (isTrustedRetailer) score += 95;
  if (name.includes("&")) score += 180;
  if (/\b(19|20)\d{2}\b/.test(normalized)) score -= 90;
  if (DISPLAY_SUFFIX_NOISE.test(normalized)) {
    score -= 360;
  }

  if (titleStartsWithPlatformPrefix(name)) {
    score -= 420;
  }

  const trailingSegment = name.split(/\s[-–—]\s*/).pop()?.trim() ?? "";
  if (trailingSegment && TRAILING_PLATFORM_SUFFIX.test(trailingSegment)) {
    score -= 500;
  }

  const letters = name.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length >= 8 && letters === letters.toUpperCase()) {
    score -= 120;
  }

  const hasCjk =
    /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf\uac00-\ud7af]/.test(
      name,
    );
  if (hasCjk) {
    score -= 200;
  }

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

export function scoreMetadataDisplayTitle(title: string): number {
  const normalized = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  let score = 0;

  if (title.includes("&")) score += 45;
  if (/[éèàùçêâôîëïüû]/i.test(title)) score += 25;
  if (inferTextLanguage(title) === "fr") score += 40;
  if (/\b(19|20)\d{2}\b/.test(normalized)) score -= 60;
  if (DISPLAY_SUFFIX_NOISE.test(normalized)) {
    score -= 120;
  }

  const hasCjk =
    /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf\uac00-\ud7af]/.test(
      title,
    );
  if (hasCjk) {
    score -= 200;
  }

  return score;
}
