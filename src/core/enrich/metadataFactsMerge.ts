import { dedupeFacts } from "@/core/enrich/facts";
import {
  dedupeProviderExternalLinkFacts,
  normalizeProviderSourceKey,
  purgeContradictedProviderExternalLinks,
} from "@/core/enrich/providerExternalLinks";
import type { MetadataFact } from "@/types/metadataProvider";

export function parseMetadataFactsJson(
  raw: string | null | undefined,
): MetadataFact[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MetadataFact[]) : [];
  } catch {
    return [];
  }
}

const PRESERVE_WHEN_ABSENT_KINDS = new Set<MetadataFact["kind"]>([
  "external-link",
  "price",
  "identifier",
  "source-url",
]);

function isPreservableExternalLinkFact(
  fact: MetadataFact,
  incomingLinks: Set<string>,
): boolean {
  if (fact.kind !== "external-link" && fact.kind !== "source-url") {
    return false;
  }
  const providerKey = normalizeProviderSourceKey(
    fact.source ?? fact.label ?? "",
  );
  if (providerKey && incomingLinks.has(providerKey)) return false;
  return Boolean(fact.url?.trim());
}

function factDedupeKey(fact: MetadataFact): string {
  return `${fact.kind}:${fact.label}:${fact.value}`.toLowerCase();
}

function incomingProviderLinkKeys(facts: MetadataFact[]): Set<string> {
  const keys = new Set<string>();
  for (const fact of facts) {
    if (fact.kind !== "external-link" && fact.kind !== "source-url") continue;
    const key = normalizeProviderSourceKey(fact.source ?? fact.label ?? "");
    if (key) keys.add(key);
  }
  return keys;
}

function incomingHasSameSourceFact(
  incoming: MetadataFact[],
  fact: MetadataFact,
): boolean {
  const sourceKey = normalizeProviderSourceKey(fact.source ?? fact.label ?? "");
  if (!sourceKey) return false;
  return incoming.some(
    (candidate) =>
      candidate.kind === fact.kind &&
      normalizeProviderSourceKey(candidate.source ?? candidate.label ?? "") ===
        sourceKey,
  );
}

/**
 * Conservative merge when re-storing metadata: incoming provider hits win on
 * conflict, but existing facts survive until the same provider replaces them.
 */
export function mergeMetadataFactsForStorage(
  existing: MetadataFact[],
  incoming: MetadataFact[],
  options: {
    itemBarcode?: string | null;
    itemTitle?: string | null;
    shelfType?: string | null;
  } = {},
): MetadataFact[] {
  const incomingDeduped = dedupeFacts(incoming) ?? [];
  if (existing.length === 0) return incomingDeduped;

  const purgedExisting = purgeContradictedProviderExternalLinks(
    existing,
    options.itemBarcode,
    options.itemTitle,
    options.shelfType,
  );
  const incomingKeys = new Set(incomingDeduped.map(factDedupeKey));
  const incomingLinks = incomingProviderLinkKeys(incomingDeduped);

  const preserved = purgedExisting.filter((fact) => {
    if (incomingKeys.has(factDedupeKey(fact))) return false;

    if (isPreservableExternalLinkFact(fact, incomingLinks)) {
      return true;
    }

    if (PRESERVE_WHEN_ABSENT_KINDS.has(fact.kind)) {
      return !incomingHasSameSourceFact(incomingDeduped, fact);
    }

    return !incomingHasSameSourceFact(incomingDeduped, fact);
  });

  const merged = dedupeFacts(
    dedupeProviderExternalLinkFacts([...incomingDeduped, ...preserved]),
  );
  return merged ?? [];
}
