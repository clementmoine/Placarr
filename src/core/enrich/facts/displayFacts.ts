import type { DetailFact } from "./playerFacts";
import { formatDetailFactSourceToken, getFactSourceNames } from "./playerFacts";

const HIDDEN_DISPLAY_KINDS = new Set([
  "identifier",
  "popularity",
  "price",
  "recommended-players",
  "review",
]);


const TAG_LIKE_KINDS = new Set([
  "category",
  "family",
  "franchise",
  "genre",
  "mechanic",
  "tag",
]);

/** genre + tag share one editorial row (chips, merged sources). */
function tagLikeConsolidationSlot(fact: DetailFact): string {
  if (fact.kind === "genre" || fact.kind === "tag") return "theme";
  return fact.kind;
}

function normalizeThemeDisplayFact(fact: DetailFact): DetailFact {
  return {
    ...fact,
    kind: "tag",
    label: "Thème",
  };
}

function splitTagValues(value: string): string[] {
  return value
    .split(/\s*•\s*/g)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function parseAgeFromFactValue(value: string): number | null {
  const match = value.match(/(\d+)/);
  if (!match) return null;
  const age = Number(match[1]);
  return Number.isFinite(age) && age > 0 ? age : null;
}

function normalizeProviderLinkOwnerKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Client-safe owner key — prefers server-stamped providerLabel over raw source tokens. */
function providerLinkOwnerKey(fact: DetailFact): string {
  const stamped = fact.providerLabel?.trim();
  if (stamped) return normalizeProviderLinkOwnerKey(stamped);
  const label = fact.label?.trim();
  if (fact.kind === "external-link" && label) {
    return normalizeProviderLinkOwnerKey(label);
  }
  const token = fact.source ?? fact.label ?? "";
  return token ? normalizeProviderLinkOwnerKey(token) : "";
}

export function extractProviderLinkFacts(facts: DetailFact[]): DetailFact[] {
  const links = facts.filter(
    (fact) => fact.kind === "external-link" && fact.url,
  );
  const bestByProvider = new Map<string, DetailFact>();

  for (const fact of links) {
    const ownerKey = providerLinkOwnerKey(fact);
    if (!ownerKey) continue;

    const existing = bestByProvider.get(ownerKey);
    if (!existing || (fact.priority ?? 0) > (existing.priority ?? 0)) {
      bestByProvider.set(ownerKey, fact);
    }
  }

  return Array.from(bestByProvider.values());
}

function mergeFactSources(
  primary: DetailFact,
  secondary: DetailFact,
): DetailFact {
  const sourceNames = Array.from(
    new Set([...getFactSourceNames(primary), ...getFactSourceNames(secondary)]),
  );

  const keep =
    (primary.priority ?? 0) >= (secondary.priority ?? 0) ? primary : secondary;

  return {
    ...keep,
    source: undefined,
    sourceCount: sourceNames.length > 0 ? sourceNames.length : undefined,
    sourceNames: sourceNames.length > 0 ? sourceNames : undefined,
  };
}

export function dedupeTagLikeFacts(facts: DetailFact[]): DetailFact[] {
  const result: DetailFact[] = [];
  const tagByKey = new Map<string, DetailFact>();

  for (const fact of facts) {
    if (!TAG_LIKE_KINDS.has(fact.kind)) {
      result.push(fact);
      continue;
    }

    const key = `${fact.kind}:${fact.value.trim().toLowerCase()}`;
    const existing = tagByKey.get(key);
    tagByKey.set(key, existing ? mergeFactSources(existing, fact) : fact);
  }

  return [...result, ...Array.from(tagByKey.values())];
}

/** Merge all facts of the same tag-like kind into one row (e.g. BGG + Philibert categories). */
export function consolidateTagLikeFactsByKind(
  facts: DetailFact[],
): DetailFact[] {
  const result: DetailFact[] = [];
  const groups = new Map<string, DetailFact[]>();

  for (const fact of facts) {
    if (!TAG_LIKE_KINDS.has(fact.kind)) {
      result.push(fact);
      continue;
    }

    const slot = tagLikeConsolidationSlot(fact);
    const group = groups.get(slot) ?? [];
    group.push(fact);
    groups.set(slot, group);
  }

  for (const [slot, kindFacts] of groups.entries()) {
    if (kindFacts.length === 1) {
      const fact = kindFacts[0]!;
      result.push(slot === "theme" ? normalizeThemeDisplayFact(fact) : fact);
      continue;
    }

    const orderedFacts = [...kindFacts].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
    const tags: string[] = [];
    const seenTags = new Set<string>();

    for (const fact of orderedFacts) {
      for (const tag of splitTagValues(fact.value)) {
        const key = tag.toLowerCase();
        if (seenTags.has(key)) continue;
        seenTags.add(key);
        tags.push(tag);
      }
    }

    const sourceNames = Array.from(
      new Set(kindFacts.flatMap((fact) => getFactSourceNames(fact))),
    );
    const lead = orderedFacts[0]!;

    const merged: DetailFact = {
      ...lead,
      value: tags.join(" • "),
      source: undefined,
      sourceCount: sourceNames.length > 0 ? sourceNames.length : undefined,
      sourceNames: sourceNames.length > 0 ? sourceNames : undefined,
    };
    result.push(slot === "theme" ? normalizeThemeDisplayFact(merged) : merged);
  }

  return result;
}

export function filterRedundantDisplayFacts(facts: DetailFact[]): DetailFact[] {
  const ageRatingAges = new Set(
    facts
      .filter((fact) => fact.kind === "age-rating")
      .map((fact) => parseAgeFromFactValue(fact.value))
      .filter((age): age is number => age !== null),
  );
  const hasAgeRating = ageRatingAges.size > 0;

  const filtered = facts.filter((fact) => {
    if (fact.kind === "external-link") return false;
    if (HIDDEN_DISPLAY_KINDS.has(fact.kind)) return false;

    if (fact.kind === "recommended-age" && hasAgeRating) {
      const age = parseAgeFromFactValue(fact.value);
      if (age !== null && ageRatingAges.has(age)) return false;
    }

    return true;
  });

  return consolidateTagLikeFactsByKind(filtered);
}

export function providerLinkDisplayLabel(fact: DetailFact): string {
  if (fact.providerLabel) return fact.providerLabel;
  return formatDetailFactSourceToken(fact, fact.label);
}

export function sortProviderLinkFacts(facts: DetailFact[]): DetailFact[] {
  return [...facts].sort((a, b) =>
    providerLinkDisplayLabel(a).localeCompare(
      providerLinkDisplayLabel(b),
      undefined,
      { sensitivity: "base" },
    ),
  );
}
