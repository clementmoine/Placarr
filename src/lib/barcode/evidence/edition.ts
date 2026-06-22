import { normalizeForTokens } from "@/lib/barcode/titleUtils";

import type { ProductEvidence } from "./types";

const EDITION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bplayers?\s*'?s?\s*choice\b/i, label: "Player's Choice" },
  { pattern: /\bnintendo\s+selects\b/i, label: "Nintendo Selects" },
  { pattern: /\bgreatest\s+hits\b/i, label: "Greatest Hits" },
  { pattern: /\bplatinum\b/i, label: "Platinum" },
  { pattern: /\bessentials?\b/i, label: "Essentials" },
  { pattern: /\bclassics\b/i, label: "Classics" },
  { pattern: /\bbest\s+of\b/i, label: "Best Of" },
  { pattern: /\bedition\s+collector\b/i, label: "Édition Collector" },
  { pattern: /\b[eé]dition\s+limit[eé]e\b/i, label: "Édition Limitée" },
  { pattern: /\blimited\s+edition\b/i, label: "Limited Edition" },
  { pattern: /\bcollectors?\s+edition\b/i, label: "Collector's Edition" },
  { pattern: /\bcollector\b/i, label: "Collector" },
];

function normalizeEditionKey(value: string): string {
  return normalizeForTokens(value).replace(/\s+/g, " ").trim();
}

export function titleContainsEdition(
  title: string,
  edition: string,
): boolean {
  const titleNorm = normalizeEditionKey(title);
  const editionNorm = normalizeEditionKey(edition);
  if (!titleNorm || !editionNorm) return false;
  return titleNorm.includes(editionNorm);
}

export function extractEditionFromText(text: string): string | null {
  if (!text?.trim()) return null;

  for (const { pattern, label } of EDITION_PATTERNS) {
    if (pattern.test(text)) return label;
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
      hasNonCanonical: false,
    };
    entry.providers.add(item.providerName);
    if (!item.isCanonical) entry.hasNonCanonical = true;
    votes.set(key, entry);
  }

  let best: { label: string; score: number } | null = null;
  for (const entry of votes.values()) {
    const score =
      entry.providers.size +
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
        ...result.matches.flatMap((match) => [match.name, ...match.suggestions]),
      ],
      result.cleanName,
    );
  const displayName = formatDisplayNameWithEdition(result.cleanName, edition);

  if (!edition) {
    return { ...result, edition: null, displayName: result.cleanName };
  }

  const suggestions = Array.from(
    new Set([displayName, ...result.suggestions.filter((s) => s !== displayName)]),
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
