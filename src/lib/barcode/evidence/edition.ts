import { normalizeForTokens } from "@/lib/barcode/titleUtils";
import {
  createTermMatcher,
  GAME_EDITION_DEFINITIONS,
} from "@/lib/barcode/listingTerms";

import type { ProductEvidence } from "./types";

const EDITION_PATTERNS: Array<{ pattern: RegExp; label: string }> =
  GAME_EDITION_DEFINITIONS.map(({ label, terms }) => ({
    label,
    pattern: createTermMatcher(terms, "i"),
  }));

function normalizeEditionKey(value: string): string {
  return normalizeForTokens(value).replace(/\s+/g, " ").trim();
}

// The least-specific edition label ("Edition" alone, no qualifier). A bare
// "— Edition" tells the user nothing about WHICH edition, so it is never
// surfaced as a display edition (it stays only as a cleaning vocabulary term).
// A real edition always carries a qualifier ("Classics", "Édition Limitée"…).
function isGenericEditionLabel(label: string): boolean {
  return normalizeEditionKey(label) === "edition";
}

export function titleContainsEdition(title: string, edition: string): boolean {
  const titleNorm = normalizeEditionKey(title);
  const editionNorm = normalizeEditionKey(edition);
  if (!titleNorm || !editionNorm) return false;
  return titleNorm.includes(editionNorm);
}

export function extractEditionFromText(text: string): string | null {
  if (!text?.trim()) return null;

  // Match accent-insensitively: a mixed-accent listing ("Edition Limitée" — no
  // accent on the E, accent on the é) otherwise misses the specific "edition
  // limitee" term and falls through to the generic "Edition" label, dropping the
  // qualifier. Every definition carries a non-accented form, so stripping
  // accents from the text lets the most specific pattern win.
  const normalized = text.normalize("NFD").replace(/[̀-ͯ]/g, "");

  for (const { pattern, label } of EDITION_PATTERNS) {
    if (pattern.test(normalized)) return label;
  }

  return null;
}

export function pickEditionFromEvidence(
  evidence: ProductEvidence[],
  baseTitle: string,
): string | null {
  const votes = new Map<
    string,
    {
      label: string;
      providers: Set<string>;
      count: number;
      hasNonCanonical: boolean;
    }
  >();

  for (const item of evidence) {
    const edition =
      extractEditionFromText(item.rawName) ||
      extractEditionFromText(item.cleanName) ||
      extractEditionFromText(item.title) ||
      (item.parsed.edition
        ? extractEditionFromText(item.parsed.edition)
        : null);
    if (!edition || titleContainsEdition(baseTitle, edition)) continue;

    const key = normalizeEditionKey(edition);
    const entry = votes.get(key) || {
      label: edition,
      providers: new Set<string>(),
      count: 0,
      hasNonCanonical: false,
    };
    entry.providers.add(item.providerName);
    entry.count += 1;
    if (!item.isCanonical) entry.hasNonCanonical = true;
    votes.set(key, entry);
  }

  let best: { label: string; score: number } | null = null;
  for (const entry of votes.values()) {
    // A qualifier-less "Edition" is never a displayable edition — it would only
    // produce a meaningless "… — Edition" (e.g. an "Edition Réflexes" listing
    // whose qualifier isn't in the vocabulary falls back to the bare label).
    if (isGenericEditionLabel(entry.label)) continue;
    // Listing VOLUME breaks ties a single dominant marketplace would otherwise
    // lose: "Edition Limitée" named by 4 PicClick listings must beat a lone
    // "Special Edition" → generic "Edition", even though both are one provider.
    const score =
      entry.providers.size +
      entry.count * 0.5 +
      (entry.hasNonCanonical ? 2 : 0) +
      (entry.providers.size >= 2 ? 1 : 0);
    if (score < 2) continue;
    if (!best || score > best.score) {
      best = { label: entry.label, score };
    }
  }

  return best?.label ?? null;
}

export function inferEditionFromNames(
  names: string[],
  baseTitle: string,
): string | null {
  const votes = new Map<string, number>();

  for (const name of names) {
    const edition = extractEditionFromText(name);
    if (!edition || titleContainsEdition(baseTitle, edition)) continue;
    const key = normalizeEditionKey(edition);
    votes.set(key, (votes.get(key) || 0) + 1);
  }

  let best: { label: string; count: number } | null = null;
  for (const [key, count] of votes.entries()) {
    const label =
      EDITION_PATTERNS.find(
        ({ label: candidate }) => normalizeEditionKey(candidate) === key,
      )?.label || key;
    // A qualifier-less "Edition" is never a displayable edition (see above).
    if (isGenericEditionLabel(label)) continue;
    if (!best || count > best.count) {
      best = { label, count };
    }
  }

  return best?.count ? best.label : null;
}

export function formatDisplayNameWithEdition(
  baseTitle: string,
  edition: string | null | undefined,
): string {
  // The base title (used for metadata/image lookup) stays clean; the edition —
  // including budget re-release lines like "Classics"/"Nintendo Selects" — is
  // recorded in its own field AND assembled back onto the displayed title, so
  // "Gottlieb Pinball" + "Classics" reads "Gottlieb Pinball — Classics".
  if (!edition?.trim() || titleContainsEdition(baseTitle, edition)) {
    return baseTitle;
  }
  return `${baseTitle} — ${edition}`;
}

export function applyEditionToCompiledResult<
  T extends {
    cleanName: string;
    suggestions: string[];
    matches: Array<{ name: string; suggestions: string[] }>;
  },
>(
  result: T,
  evidence: ProductEvidence[],
): T & { edition: string | null; displayName: string } {
  const edition =
    pickEditionFromEvidence(evidence, result.cleanName) ||
    inferEditionFromNames(
      [
        result.cleanName,
        ...result.suggestions,
        ...result.matches.flatMap((match) => [
          match.name,
          ...match.suggestions,
        ]),
      ],
      result.cleanName,
    );
  const displayName = formatDisplayNameWithEdition(result.cleanName, edition);

  if (!edition) {
    return { ...result, edition: null, displayName: result.cleanName };
  }

  const suggestions = Array.from(
    new Set([
      displayName,
      ...result.suggestions.filter((s) => s !== displayName),
    ]),
  );
  const matches = result.matches.map((match, index) => {
    if (index !== 0) return match;
    const matchDisplayName = formatDisplayNameWithEdition(match.name, edition);
    return {
      ...match,
      name: matchDisplayName,
      suggestions: Array.from(
        new Set([
          matchDisplayName,
          ...match.suggestions.filter((s) => s !== matchDisplayName),
        ]),
      ),
    };
  });

  return {
    ...result,
    edition,
    displayName,
    suggestions,
    matches,
  };
}
