export const VOLUME_KEYWORD_PATTERN =
  "(?:tome|vol(?:ume)?|numero|num|chapitre|chapter|ch|partie|part|pt)";

export function normalizeVolumeTitleText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\bn[°º]\s*/g, "n ")
    .replace(/[#/._-]+/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeVolumeNumber(value: string): string {
  return String(Number.parseInt(value, 10));
}

function pushVolumeNumber(target: string[], raw: string | undefined) {
  if (!raw) return;
  const normalized = normalizeVolumeNumber(raw);
  if (normalized === "NaN") return;
  target.push(normalized);
}

/**
 * Extracts every issue/volume number explicitly marked in a title
 * (Tome, Vol., n°, #, Chapitre, …). Ignores bare sequel numbers
 * ("Resident Evil 2") so games and unnumbered works stay safe.
 */
export function explicitVolumeNumbers(value: string): string[] {
  const numbers: string[] = [];
  const hashSource = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  for (const match of hashSource.matchAll(/#\s*0*(\d+)\b/g)) {
    pushVolumeNumber(numbers, match[1]);
  }

  const normalized = normalizeVolumeTitleText(value);
  if (!normalized) return Array.from(new Set(numbers));

  for (const match of normalized.matchAll(
    new RegExp(`\\b${VOLUME_KEYWORD_PATTERN}\\s*0*(\\d+)\\b`, "g"),
  )) {
    pushVolumeNumber(numbers, match[1]);
  }

  for (const match of normalized.matchAll(/\bno\.?\s+0*(\d+)\b/g)) {
    pushVolumeNumber(numbers, match[1]);
  }

  for (const match of normalized.matchAll(/\bn\s+0*(\d+)\b/g)) {
    pushVolumeNumber(numbers, match[1]);
  }

  return Array.from(new Set(numbers));
}

/** Primary volume/issue number for a shelf item or provider title. */
export function volumeNumberFromTitle(value: string): string | null {
  const numbers = explicitVolumeNumbers(value);
  if (numbers.length === 0) return null;
  return numbers[numbers.length - 1] ?? null;
}

/**
 * Keeps display titles intact but strips decorative zero-padding from volume
 * markers so URL slugs stay short (n°36, not n°036).
 */
export function unpaddedVolumeNumbersInTitle(value: string): string {
  let result = value;

  result = result.replace(/#\s*0+(\d+)\b/g, (_, digits) =>
    `#${Number.parseInt(digits, 10)}`,
  );

  result = result.replace(
    /n[°º]\s*0+(\d+)\b/gi,
    (_, digits) => `n°${Number.parseInt(digits, 10)}`,
  );

  result = result.replace(
    new RegExp(
      `\\b(${VOLUME_KEYWORD_PATTERN}|num[eé]ro)\\s*\\.\\s*0+(\\d+)\\b`,
      "gi",
    ),
    (_, keyword, digits) => {
      const parsed = Number.parseInt(digits, 10);
      return /^vol/i.test(keyword) ? `${keyword}. ${parsed}` : `${keyword} ${parsed}`;
    },
  );

  result = result.replace(
    new RegExp(
      `\\b(${VOLUME_KEYWORD_PATTERN}|num[eé]ro)\\s+0+(\\d+)\\b`,
      "gi",
    ),
    (_, keyword, digits) => `${keyword} ${Number.parseInt(digits, 10)}`,
  );

  return result;
}

/**
 * Inverse of `unpaddedVolumeNumbersInTitle`: re-pads every explicit volume marker
 * to a fixed digit `width` (zero-filled), normalising whatever padding the source
 * supplied. Used for *display* so a series lines up on the width of its largest
 * volume (`n°36` → `n°036` when the series reaches 100). Titles without a marker
 * are returned untouched.
 */
export function padVolumeNumbersInTitle(value: string, width: number): string {
  if (!Number.isFinite(width) || width < 1) return value;

  const pad = (digits: string) =>
    String(Number.parseInt(digits, 10)).padStart(Math.trunc(width), "0");

  let result = value;

  result = result.replace(/#\s*0*(\d+)\b/g, (_, digits) => `#${pad(digits)}`);

  result = result.replace(
    /n[°º]\s*0*(\d+)\b/gi,
    (_, digits) => `n°${pad(digits)}`,
  );

  result = result.replace(
    new RegExp(
      `\\b(${VOLUME_KEYWORD_PATTERN}|num[eé]ro)\\s*\\.\\s*0*(\\d+)\\b`,
      "gi",
    ),
    (_, keyword, digits) =>
      /^vol/i.test(keyword) ? `${keyword}. ${pad(digits)}` : `${keyword} ${pad(digits)}`,
  );

  result = result.replace(
    new RegExp(`\\b(${VOLUME_KEYWORD_PATTERN}|num[eé]ro)\\s+0*(\\d+)\\b`, "gi"),
    (_, keyword, digits) => `${keyword} ${pad(digits)}`,
  );

  return result;
}

export function hasExplicitVolumeMarker(value: string): boolean {
  return explicitVolumeNumbers(value).length > 0;
}

/**
 * Search normalization: removes volume *markers* (`#`, `n°`, `Tome`, `Vol.`,
 * `Chapitre`, `Numéro`…) while KEEPING the volume number, unpadded — and otherwise
 * preserves the text (case, accents) so it stays a faithful search-token source.
 * Every way a user might type a volume collapses to the bare number, so search is
 * marker- and padding-agnostic:
 *   "Naruto n°01" → "Naruto 1", "Death Note Vol. 007" → "Death Note 7",
 *   "Attack on Titan #12" → "Attack on Titan 12", "01" → "1".
 * Titles with no marker keep their text (numbers are still unpadded).
 */
export function stripVolumeMarkersKeepingNumber(value: string): string {
  return value
    .replace(/#\s*0*(\d+)\b/g, "$1")
    .replace(/n[°º]\s*0*(\d+)\b/gi, "$1")
    .replace(
      new RegExp(
        `\\b(?:${VOLUME_KEYWORD_PATTERN}|num[eé]ro)\\.?\\s*0*(\\d+)\\b`,
        "gi",
      ),
      "$1",
    )
    .replace(/\bno\.?\s*0*(\d+)\b/gi, "$1")
    .replace(/\b0+(\d+)\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripVolumeMarkersFromTitle(value: string): string {
  const withoutHash = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/#\s*0*\d+\b/g, " ");

  return normalizeVolumeTitleText(withoutHash)
    .replace(/#\s*0*\d+\b/g, " ")
    .replace(
      new RegExp(`\\b${VOLUME_KEYWORD_PATTERN}\\s*0*\\d+\\b`, "g"),
      " ",
    )
    .replace(/\bno\.?\s+0*\d+\b/g, " ")
    .replace(/\bn\s+0*\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
