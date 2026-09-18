export const VOLUME_KEYWORD_PATTERN =
  "(?:tome|vol(?:ume)?|numero|num|chapitre|chapter|ch|partie|part|pt)";

/**
 * French interim-issue ordinal suffixes: n°100bis sits between n°100 and
 * n°101 and is a distinct issue, never interchangeable with n°100.
 */
const VOLUME_NUMBER_SUFFIXES = ["bis", "ter", "quater"] as const;

export const VOLUME_NUMBER_SUFFIX_PATTERN = `(?:${VOLUME_NUMBER_SUFFIXES.join("|")})`;

/** A volume number with its optional suffix ("36", "100bis", "100 bis"). */
const VOLUME_NUMBER_PATTERN = `\\d+(?:\\s?${VOLUME_NUMBER_SUFFIX_PATTERN})?`;

const VOLUME_NUMBER_VALUE_RE = new RegExp(
  `^0*(\\d+)[\\s-]*(${VOLUME_NUMBER_SUFFIXES.join("|")})?$`,
  "i",
);

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
  const match = String(value).trim().match(VOLUME_NUMBER_VALUE_RE);
  if (!match) return String(Number.parseInt(value, 10));
  const suffix = match[2]?.toLowerCase() ?? "";
  return `${Number.parseInt(match[1], 10)}${suffix}`;
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

  for (const match of hashSource.matchAll(
    new RegExp(`#\\s*0*(${VOLUME_NUMBER_PATTERN})\\b`, "g"),
  )) {
    pushVolumeNumber(numbers, match[1]);
  }

  const normalized = normalizeVolumeTitleText(value);
  if (!normalized) return Array.from(new Set(numbers));

  for (const match of normalized.matchAll(
    new RegExp(
      `\\b${VOLUME_KEYWORD_PATTERN}\\s*0*(${VOLUME_NUMBER_PATTERN})\\b`,
      "g",
    ),
  )) {
    pushVolumeNumber(numbers, match[1]);
  }

  for (const match of normalized.matchAll(
    new RegExp(`\\bno\\.?\\s+0*(${VOLUME_NUMBER_PATTERN})\\b`, "g"),
  )) {
    pushVolumeNumber(numbers, match[1]);
  }

  for (const match of normalized.matchAll(
    new RegExp(`\\bn\\s+0*(${VOLUME_NUMBER_PATTERN})\\b`, "g"),
  )) {
    pushVolumeNumber(numbers, match[1]);
  }

  // Marketplace copy often drops the marker: "Picsou 65 BIS" (not "n°65 bis").
  for (const match of normalized.matchAll(
    new RegExp(`\\b0*(\\d+)\\s?(${VOLUME_NUMBER_SUFFIX_PATTERN})\\b`, "g"),
  )) {
    pushVolumeNumber(numbers, `${match[1]}${match[2]}`);
  }

  return Array.from(new Set(numbers));
}

/** Primary volume/issue number for a shelf item or provider title. */
export function volumeNumberFromTitle(value: string): string | null {
  const numbers = explicitVolumeNumbers(value);
  if (numbers.length === 0) return null;
  // Prefer French interim suffixes (bis/ter) over trailing noise like "VRAI N° 1".
  const suffixed = numbers.filter((number) =>
    new RegExp(`${VOLUME_NUMBER_SUFFIX_PATTERN}$`, "i").test(number),
  );
  if (suffixed.length > 0) {
    return suffixed[suffixed.length - 1] ?? null;
  }
  return numbers[numbers.length - 1] ?? null;
}

/**
 * Volume for marketplace price rows: marked issues first, else a bare digit that
 * matches the item's explicit issue (e.g. item "n°081" vs listing "… Géant 81").
 */
export function volumeNumberFromPriceListing(
  itemName: string,
  listingName: string,
): string | null {
  const marked = volumeNumberFromTitle(listingName);
  if (marked) return marked;

  const itemVol = volumeNumberFromTitle(itemName);
  if (!itemVol) return null;

  const text = normalizeVolumeTitleText(listingName);
  if (!text) return null;

  for (const match of text.matchAll(/\b0*(\d+)\b/g)) {
    const raw = match[1]!;
    if (raw.length === 4 && /^(?:19|20)\d{2}$/.test(raw)) continue;
    if (normalizeVolumeNumber(raw) === itemVol) return itemVol;
  }
  return null;
}

/**
 * Keeps display titles intact but strips decorative zero-padding from volume
 * markers so URL slugs stay short (n°36, not n°036).
 */
export function unpaddedVolumeNumbersInTitle(value: string): string {
  let result = value;

  result = result.replace(
    new RegExp(`#\\s*0+(\\d+)(\\s?${VOLUME_NUMBER_SUFFIX_PATTERN})?\\b`, "gi"),
    (_, digits, suffix = "") => `#${Number.parseInt(digits, 10)}${suffix}`,
  );

  result = result.replace(
    new RegExp(
      `n[°º]\\s*0+(\\d+)(\\s?${VOLUME_NUMBER_SUFFIX_PATTERN})?\\b`,
      "gi",
    ),
    (_, digits, suffix = "") => `n°${Number.parseInt(digits, 10)}${suffix}`,
  );

  result = result.replace(
    new RegExp(
      `\\b(${VOLUME_KEYWORD_PATTERN}|num[eé]ro)\\s*\\.\\s*0+(\\d+)(\\s?${VOLUME_NUMBER_SUFFIX_PATTERN})?\\b`,
      "gi",
    ),
    (_, keyword, digits, suffix = "") => {
      const parsed = `${Number.parseInt(digits, 10)}${suffix}`;
      return /^vol/i.test(keyword)
        ? `${keyword}. ${parsed}`
        : `${keyword} ${parsed}`;
    },
  );

  result = result.replace(
    new RegExp(
      `\\b(${VOLUME_KEYWORD_PATTERN}|num[eé]ro)\\s+0+(\\d+)(\\s?${VOLUME_NUMBER_SUFFIX_PATTERN})?\\b`,
      "gi",
    ),
    (_, keyword, digits, suffix = "") =>
      `${keyword} ${Number.parseInt(digits, 10)}${suffix}`,
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

  result = result.replace(
    new RegExp(`#\\s*0*(\\d+)(\\s?${VOLUME_NUMBER_SUFFIX_PATTERN})?\\b`, "gi"),
    (_, digits, suffix = "") => `#${pad(digits)}${suffix}`,
  );

  result = result.replace(
    new RegExp(
      `n[°º]\\s*0*(\\d+)(\\s?${VOLUME_NUMBER_SUFFIX_PATTERN})?\\b`,
      "gi",
    ),
    (_, digits, suffix = "") => `n°${pad(digits)}${suffix}`,
  );

  result = result.replace(
    new RegExp(
      `\\b(${VOLUME_KEYWORD_PATTERN}|num[eé]ro)\\s*\\.\\s*0*(\\d+)(\\s?${VOLUME_NUMBER_SUFFIX_PATTERN})?\\b`,
      "gi",
    ),
    (_, keyword, digits, suffix = "") =>
      /^vol/i.test(keyword)
        ? `${keyword}. ${pad(digits)}${suffix}`
        : `${keyword} ${pad(digits)}${suffix}`,
  );

  result = result.replace(
    new RegExp(
      `\\b(${VOLUME_KEYWORD_PATTERN}|num[eé]ro)\\s+0*(\\d+)(\\s?${VOLUME_NUMBER_SUFFIX_PATTERN})?\\b`,
      "gi",
    ),
    (_, keyword, digits, suffix = "") => `${keyword} ${pad(digits)}${suffix}`,
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
    .replace(new RegExp(`#\\s*0*(${VOLUME_NUMBER_PATTERN})\\b`, "gi"), "$1")
    .replace(new RegExp(`n[°º]\\s*0*(${VOLUME_NUMBER_PATTERN})\\b`, "gi"), "$1")
    .replace(
      new RegExp(
        `\\b(?:${VOLUME_KEYWORD_PATTERN}|num[eé]ro)\\.?\\s*0*(${VOLUME_NUMBER_PATTERN})\\b`,
        "gi",
      ),
      "$1",
    )
    .replace(
      new RegExp(`\\bno\\.?\\s*0*(${VOLUME_NUMBER_PATTERN})\\b`, "gi"),
      "$1",
    )
    .replace(/\b0+(\d+)\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripVolumeMarkersFromTitle(value: string): string {
  const withoutHash = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(new RegExp(`#\\s*0*${VOLUME_NUMBER_PATTERN}\\b`, "g"), " ");

  return normalizeVolumeTitleText(withoutHash)
    .replace(new RegExp(`#\\s*0*${VOLUME_NUMBER_PATTERN}\\b`, "g"), " ")
    .replace(
      new RegExp(
        `\\b${VOLUME_KEYWORD_PATTERN}\\s*0*${VOLUME_NUMBER_PATTERN}\\b`,
        "g",
      ),
      " ",
    )
    .replace(new RegExp(`\\bno\\.?\\s+0*${VOLUME_NUMBER_PATTERN}\\b`, "g"), " ")
    .replace(new RegExp(`\\bn\\s+0*${VOLUME_NUMBER_PATTERN}\\b`, "g"), " ")
    .replace(/\s+/g, " ")
    .trim();
}
