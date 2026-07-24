/**
 * Parenthetical release-year disambiguators in shelf titles
 * ("Resident Evil 4 (2023)" vs "(2005)"). Not part of the catalog game title —
 * strip for search, keep as a soft discriminant against releaseDate.
 */

const PAREN_YEAR_RE = /\(\s*((?:19|20)\d{2})\s*\)/g;
/** Bare season/edition years in sports & annual titles ("FIFA 2001", "Stars 2000"). */
const BARE_SEASON_YEAR_RE = /\b((?:19|20)\d{2})\b/g;

/** ±1 year covers regional street-date drift; remakes are usually far apart. */
export const TITLE_INTENT_YEAR_TOLERANCE = 1;

export function extractTitleIntentYear(title: string): number | null {
  const matches = Array.from(title.matchAll(PAREN_YEAR_RE));
  const raw = matches.at(-1)?.[1];
  if (!raw) return null;
  const year = Number.parseInt(raw, 10);
  if (!Number.isFinite(year) || year < 1970 || year > 2100) return null;
  return year;
}

/**
 * Years that identify an annual/sports edition in the title itself.
 * Parenthetical intent years win when present; otherwise bare 19xx/20xx tokens.
 */
export function extractTitleSeasonYears(title: string): number[] {
  const intent = extractTitleIntentYear(title);
  if (intent != null) return [intent];

  const years: number[] = [];
  const seen = new Set<number>();
  for (const match of title.matchAll(BARE_SEASON_YEAR_RE)) {
    const year = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isFinite(year) || year < 1970 || year > 2100) continue;
    if (seen.has(year)) continue;
    seen.add(year);
    years.push(year);
  }
  return years;
}

/**
 * True when both sides name a season/edition year and they disagree.
 * Exact match only — FIFA 2001 must not accept FIFA 2000.
 */
export function titleSeasonYearsConflict(
  requestedNames: readonly string[],
  catalogTitle: string,
): boolean {
  const requested = new Set(
    requestedNames.flatMap((name) => extractTitleSeasonYears(name)),
  );
  if (requested.size === 0) return false;
  const catalog = extractTitleSeasonYears(catalogTitle);
  if (catalog.length === 0) return false;
  return !catalog.some((year) => requested.has(year));
}

/** Removes `(YYYY)` disambiguators; leaves the playable title for provider search. */
export function stripTitleIntentYear(title: string): string {
  return title
    .replace(PAREN_YEAR_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function yearFromReleaseDate(
  releaseDate?: string | null,
): number | null {
  if (!releaseDate?.trim()) return null;
  const match = releaseDate.trim().match(/^(\d{4})\b/);
  if (!match?.[1]) return null;
  const year = Number.parseInt(match[1], 10);
  if (!Number.isFinite(year) || year < 1970 || year > 2100) return null;
  return year;
}

export type TitleIntentYearAlignment = "match" | "mismatch" | "unknown";

export function titleIntentYearAlignment(
  intentYear: number | null | undefined,
  releaseDate?: string | null,
  tolerance: number = TITLE_INTENT_YEAR_TOLERANCE,
): TitleIntentYearAlignment {
  if (intentYear == null) return "unknown";
  const releaseYear = yearFromReleaseDate(releaseDate);
  if (releaseYear == null) return "unknown";
  return Math.abs(releaseYear - intentYear) <= tolerance
    ? "match"
    : "mismatch";
}

/** Soft score delta when ranking two release dates against a title intent year. */
export function titleIntentYearScoreDelta(
  intentYear: number | null | undefined,
  releaseDate?: string | null,
  tolerance: number = TITLE_INTENT_YEAR_TOLERANCE,
): number {
  const alignment = titleIntentYearAlignment(
    intentYear,
    releaseDate,
    tolerance,
  );
  if (alignment === "match") return 200;
  if (alignment === "mismatch") return -400;
  return 0;
}

/**
 * Prefer the candidate whose releaseDate matches the title year when both
 * sides have a date signal; otherwise leave the comparison undecided (0).
 */
export function preferReleaseDateMatchingTitleYear(
  intentYear: number | null | undefined,
  currentReleaseDate?: string | null,
  candidateReleaseDate?: string | null,
  tolerance: number = TITLE_INTENT_YEAR_TOLERANCE,
): number {
  if (intentYear == null) return 0;
  const current = titleIntentYearAlignment(
    intentYear,
    currentReleaseDate,
    tolerance,
  );
  const candidate = titleIntentYearAlignment(
    intentYear,
    candidateReleaseDate,
    tolerance,
  );
  if (candidate === "match" && current === "mismatch") return 1;
  if (candidate === "mismatch" && current === "match") return -1;
  return 0;
}
