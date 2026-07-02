import {
  deromanize,
  deromanizeText,
  matchRomans,
  romanize,
  romanizeText,
} from "romanizr";

export { deromanize, deromanizeText, matchRomans, romanize, romanizeText };

const ROMAN_TOKEN = /^[IVXLCDM]+$/i;
const SINGLE_ROMAN_SEQUEL = new Set(["i", "v", "x"]);

/** Parses a single roman token (e.g. "vii" → 7). Returns null when invalid or ambiguous. */
export function parseRomanToken(token: string): number | null {
  const trimmed = token.trim();
  if (!trimmed || !ROMAN_TOKEN.test(trimmed)) return null;
  if (
    trimmed.length === 1 &&
    !SINGLE_ROMAN_SEQUEL.has(trimmed.toLowerCase())
  ) {
    return null;
  }
  try {
    const value = deromanize(trimmed);
    if (!Number.isFinite(value) || value < 1 || value > 99) return null;
    return value;
  } catch {
    return null;
  }
}

/** Bidirectional roman ↔ arabic variants using whole-token swaps only. */
export function buildRomanNumeralTitleVariants(title: string): string[] {
  const trimmed = title.trim();
  if (!trimmed) return [];

  const variants: string[] = [];

  const deromanized = trimmed.replace(/\b([IVXLCDM]{1,7})\b/gi, (match) => {
    const value = parseRomanToken(match);
    return value != null ? String(value) : match;
  });
  if (deromanized !== trimmed) variants.push(deromanized);

  const romanized = trimmed.replace(/\b(\d{1,2})\b/g, (match, digits) => {
    const value = Number.parseInt(digits, 10);
    if (value < 1 || value > 99 || (value >= 1900 && value <= 2099)) {
      return match;
    }
    try {
      return romanize(value);
    } catch {
      return match;
    }
  });
  if (romanized !== trimmed) variants.push(romanized);

  return variants;
}

/** "Tomb Raider IV-VI" -> "Tomb Raider 4 5 6" and "Tomb Raider 4-6". */
export function buildRomanRangeTitleVariants(title: string): string[] {
  const match = title.match(/\b([IVXLCDM]+)\s*([-–—])\s*([IVXLCDM]+)\b/i);
  if (!match) return [];

  const start = parseRomanToken(match[1]);
  const end = parseRomanToken(match[3]);
  if (!start || !end || end < start || end - start > 8) return [];

  const numbers = Array.from({ length: end - start + 1 }, (_, index) =>
    String(start + index),
  );
  const range = match[0];
  return [
    title.replace(range, numbers.join(" ")),
    title.replace(range, `${numbers[0]}-${numbers[numbers.length - 1]}`),
  ];
}
