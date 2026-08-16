import type { DetailFact } from "./playerFacts";
import { formatDetailFactSourceToken, getFactSourceNames } from "./playerFacts";
import { isInternalMetadataMergeKey } from "@/core/enrich/internalMergeKeys";

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

/** Free-form theme/genre chips — not structured collector fields (Type, PV…). */
function isGenericThemeLabel(label: string | undefined | null): boolean {
  const normalized = label?.trim().toLowerCase() ?? "";
  if (!normalized) return true;
  return /^(th[eè]mes?|themes?|tags?|genres?)\b/i.test(normalized);
}

/**
 * genre + generic theme tags share one editorial row. Labeled collector tags
 * (Rareté, Type, PV, Coût…) keep their own row so TCG facts stay readable.
 */
function tagLikeConsolidationSlot(fact: DetailFact): string {
  if (fact.kind === "genre") return "theme";
  if (fact.kind === "tag") {
    if (isGenericThemeLabel(fact.label)) return "theme";
    return `tag:${fact.label!.trim().toLowerCase()}`;
  }
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

/** Labels that legitimately hold multiple chips from one provider. */
function isMultiValueCollectorLabel(label: string | undefined | null): boolean {
  const normalized = label?.trim().toLowerCase() ?? "";
  return /^(finitions?\b|sous-types?|th[eè]mes?|themes?|tags?)/i.test(
    normalized,
  );
}

function collectorNumberScore(value: string): number {
  // Prefer printed `11/108` over a bare `11`.
  if (/^\s*\S+\/\S+\s*$/.test(value)) return 2;
  if (value.includes("/")) return 1;
  return 0;
}

function pickPreferredFact(candidates: DetailFact[]): DetailFact {
  return [...candidates].sort((a, b) => {
    const byPriority = (b.priority ?? 0) - (a.priority ?? 0);
    if (byPriority !== 0) return byPriority;
    const byNumber =
      collectorNumberScore(b.value) - collectorNumberScore(a.value);
    if (byNumber !== 0) return byNumber;
    return b.value.length - a.value.length;
  })[0]!;
}

/**
 * Collapse duplicate kind+label rows (stale seed + fresh provider) into one
 * readable fact. Scalar collector labels keep a single value; multi-value
 * labels still chip-join.
 */
export function collapseDuplicateDisplayFactSlots(
  facts: DetailFact[],
): DetailFact[] {
  const categoryValues = new Set(
    facts
      .filter((fact) => fact.kind === "category")
      .flatMap((fact) =>
        splitTagValues(fact.value).map((v) => v.toLowerCase()),
      ),
  );

  const groups = new Map<string, DetailFact[]>();
  const passthrough: DetailFact[] = [];

  for (const fact of facts) {
    // Theme soup / ratings already handled elsewhere; collapse structured rows.
    if (
      fact.kind === "external-link" ||
      fact.kind === "rating" ||
      fact.kind === "estimated-value"
    ) {
      passthrough.push(fact);
      continue;
    }
    const label = fact.label?.trim().toLowerCase() ?? "";
    if (!label) {
      passthrough.push(fact);
      continue;
    }
    // Drop legacy `Type=Pokémon` once Catégorie already carries that value.
    if (
      fact.kind === "tag" &&
      label === "type" &&
      categoryValues.has(fact.value.trim().toLowerCase())
    ) {
      continue;
    }
    const key = `${fact.kind}\0${label}`;
    const group = groups.get(key) ?? [];
    group.push(fact);
    groups.set(key, group);
  }

  const collapsed: DetailFact[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      collapsed.push(group[0]!);
      continue;
    }

    if (isMultiValueCollectorLabel(group[0]?.label)) {
      const ordered = [...group].sort(
        (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
      );
      const tags: string[] = [];
      const seen = new Set<string>();
      for (const fact of ordered) {
        for (const tag of splitTagValues(fact.value)) {
          const key = tag.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          tags.push(tag);
        }
      }
      const sourceNames = Array.from(
        new Set(group.flatMap((fact) => getFactSourceNames(fact))),
      );
      const lead = ordered[0]!;
      collapsed.push({
        ...lead,
        value: tags.join(" • "),
        source: undefined,
        sourceCount: sourceNames.length > 0 ? sourceNames.length : undefined,
        sourceNames: sourceNames.length > 0 ? sourceNames : undefined,
      });
      continue;
    }

    const best = pickPreferredFact(group);
    const sourceNames = Array.from(
      new Set(group.flatMap((fact) => getFactSourceNames(fact))),
    );
    collapsed.push({
      ...best,
      source: undefined,
      sourceCount: sourceNames.length > 0 ? sourceNames.length : undefined,
      sourceNames: sourceNames.length > 0 ? sourceNames : undefined,
    });
  }

  return [...passthrough, ...collapsed];
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
  const label = fact.label?.trim();
  // Region chips ("PriceCharting (EUR)" / "(US)") must stay distinct — stamped
  // providerLabel is the same for both and would collapse them.
  if (fact.kind === "external-link" && label) {
    return normalizeProviderLinkOwnerKey(label);
  }
  const stamped = fact.providerLabel?.trim();
  if (stamped) return normalizeProviderLinkOwnerKey(stamped);
  const token = fact.source ?? fact.label ?? "";
  return token ? normalizeProviderLinkOwnerKey(token) : "";
}

export function extractProviderLinkFacts(facts: DetailFact[]): DetailFact[] {
  const links = facts.filter(
    (fact) =>
      fact.kind === "external-link" &&
      fact.url &&
      !isInternalMetadataMergeKey(fact.source) &&
      !isInternalMetadataMergeKey(fact.label) &&
      !isInternalMetadataMergeKey(fact.providerLabel),
  );
  const bestByProvider = new Map<string, DetailFact>();

  for (const fact of links) {
    const ownerKey = providerLinkOwnerKey(fact);
    if (!ownerKey || isInternalMetadataMergeKey(ownerKey)) continue;

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
    const lead = orderedFacts[0]!;

    // Labeled scalar collector tags (Type, PV, Rareté…): one value, not a soup.
    if (slot.startsWith("tag:") && !isMultiValueCollectorLabel(lead.label)) {
      const sourceNames = Array.from(
        new Set(kindFacts.flatMap((fact) => getFactSourceNames(fact))),
      );
      result.push({
        ...pickPreferredFact(orderedFacts),
        source: undefined,
        sourceCount: sourceNames.length > 0 ? sourceNames.length : undefined,
        sourceNames: sourceNames.length > 0 ? sourceNames : undefined,
      });
      continue;
    }

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

  return collapseDuplicateDisplayFactSlots(
    consolidateTagLikeFactsByKind(filtered),
  );
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
