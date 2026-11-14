import { dedupeFacts } from "@/core/enrich/facts";
import { parseMetadataFactsJson } from "@/core/enrich/metadataFactsMerge";
import {
  dedupeProviderExternalLinkFacts,
  looksLikeProviderProductPageUrl,
  normalizeProviderSourceKey,
  purgeContradictedProviderExternalLinks,
} from "@/core/enrich/providerExternalLinks";
import { formatProviderSourceLabel } from "@/core/catalog/catalog";
import type { FieldEvidenceInput } from "@/core/enrich/evidence";
import type { MetadataFact } from "@/types/metadataProvider";
import { prisma } from "@/lib/db/prisma";

const COLUMN_BACKED_EVIDENCE_FIELDS = new Set([
  "title",
  "description",
  "releaseDate",
  "imageUrl",
  "cover",
  "author",
  "publisher",
  "alias",
  "regionalTitle",
  "barcode",
  "pageCount",
  "duration",
  "tracksCount",
]);

const PROJECTABLE_FACT_KINDS = new Set<MetadataFact["kind"]>([
  "age-rating",
  "artist",
  "category",
  "cooperative",
  "complexity",
  "family",
  "format",
  "franchise",
  "genre",
  "identifier",
  "mechanic",
  "modes",
  "platform",
  "popularity",
  "price",
  "publisher",
  "rating",
  "release-date",
  "review",
  "series",
  "source-url",
  "store",
  "tag",
  "weight",
]);

function displayFactIdentityKey(fact: {
  kind: string;
  label?: string | null;
  source?: string | null;
}): string {
  return `${fact.kind}\0${fact.label ?? ""}\0${normalizeProviderSourceKey(
    fact.source ?? "",
  )}`;
}

function parseFieldEvidenceDisplayFact(
  entry: FieldEvidenceInput,
): MetadataFact | null {
  const field = entry.field?.trim();
  const source = entry.source?.trim();
  const value = entry.value?.trim();
  if (!field || !source || !value) return null;
  if (field.startsWith("external-link:")) return null;
  if (field.startsWith("attachment:")) return null;
  if (COLUMN_BACKED_EVIDENCE_FIELDS.has(field)) return null;

  const colonIdx = field.indexOf(":");
  let kind = (
    colonIdx > 0 ? field.slice(0, colonIdx) : field
  ) as MetadataFact["kind"];
  const label =
    colonIdx > 0
      ? field.slice(colonIdx + 1)
      : formatProviderSourceLabel(source);

  if (kind === "tag" && label === "Poids") kind = "weight";
  if (kind === "tag" && label === "Estimation") kind = "price";
  if (kind === "estimate") kind = "price";

  if (!PROJECTABLE_FACT_KINDS.has(kind)) return null;
  const sourceUrl = entry.sourceUrl?.trim();
  const url =
    sourceUrl && looksLikeProviderProductPageUrl(sourceUrl)
      ? sourceUrl
      : undefined;

  return {
    kind,
    label,
    value,
    source,
    url,
    priority: entry.priority ?? undefined,
    confidence: entry.confidence ?? undefined,
  };
}

/**
 * Project evidence into display facts. Same kind+label+source as an existing
 * fact is a no-op when the value matches; a different value is an upgrade
 * (e.g. Numéro `11` → `11/108` after set size is known).
 */
export function displayFactsFromFieldEvidence(
  evidence: readonly FieldEvidenceInput[],
  existingFacts: MetadataFact[] = [],
): MetadataFact[] {
  const existingByKey = new Map(
    existingFacts.map((fact) => [displayFactIdentityKey(fact), fact] as const),
  );
  const changes: MetadataFact[] = [];

  for (const entry of evidence) {
    const fact = parseFieldEvidenceDisplayFact(entry);
    if (!fact) continue;
    const key = displayFactIdentityKey(fact);
    const existing = existingByKey.get(key);
    if (existing && existing.value === fact.value) continue;
    existingByKey.set(key, fact);
    changes.push(fact);
  }

  return changes;
}

function factsSnapshot(facts: MetadataFact[]): string {
  return JSON.stringify(
    facts
      .map((fact) => ({
        kind: fact.kind,
        label: fact.label ?? "",
        value: fact.value,
        source: fact.source ?? "",
        url: fact.url ?? "",
      }))
      .sort((a, b) =>
        `${a.kind}\0${a.label}\0${a.source}\0${a.value}`.localeCompare(
          `${b.kind}\0${b.label}\0${b.source}\0${b.value}`,
        ),
      ),
  );
}

function dropSupersededMiscTagFacts(facts: MetadataFact[]): MetadataFact[] {
  const promotedLabels = new Set(
    facts
      .filter(
        (fact) =>
          fact.kind === "weight" ||
          (fact.kind === "price" && fact.label === "Estimation"),
      )
      .map((fact) => fact.label),
  );
  const hasPriceEstimation = facts.some(
    (fact) => fact.kind === "price" && fact.label === "Estimation",
  );
  return facts.filter((fact) => {
    if (hasPriceEstimation && fact.kind === "estimate") return false;
    return !(
      fact.kind === "tag" &&
      fact.label != null &&
      promotedLabels.has(fact.label)
    );
  });
}

function normalizeMiscTagFacts(facts: MetadataFact[]): MetadataFact[] {
  const normalized = facts.flatMap((fact) => {
    if (fact.kind === "estimate") {
      return [
        { ...fact, kind: "price" as const, label: fact.label || "Estimation" },
      ];
    }
    if (fact.kind !== "tag") return [fact];
    if (fact.label === "Poids") return [{ ...fact, kind: "weight" as const }];
    if (fact.label === "Estimation") {
      return [{ ...fact, kind: "price" as const }];
    }
    return [fact];
  });
  return dropSupersededMiscTagFacts(normalized);
}

export async function syncMetadataDisplayFactsFromFieldEvidence(input: {
  metadataId: string;
  itemBarcode?: string | null;
  itemTitle?: string | null;
  shelfType?: string | null;
}): Promise<MetadataFact[] | null> {
  const row = await prisma.metadata.findUnique({
    where: { id: input.metadataId },
    select: { facts: true },
  });
  if (!row) return null;

  const evidence = await prisma.fieldEvidence.findMany({
    where: { metadataId: input.metadataId },
    select: {
      field: true,
      source: true,
      value: true,
      sourceUrl: true,
      priority: true,
      confidence: true,
    },
  });

  const rawExisting = parseMetadataFactsJson(row.facts);
  const existing = normalizeMiscTagFacts(rawExisting);
  const changes = displayFactsFromFieldEvidence(evidence, existing);

  const byKey = new Map(
    existing.map((fact) => [displayFactIdentityKey(fact), fact] as const),
  );
  for (const fact of changes) {
    byKey.set(displayFactIdentityKey(fact), fact);
  }

  const merged = purgeContradictedProviderExternalLinks(
    dropSupersededMiscTagFacts(
      dedupeFacts(dedupeProviderExternalLinkFacts([...byKey.values()])) ?? [],
    ),
    input.itemBarcode,
    input.itemTitle,
    input.shelfType,
  );

  if (factsSnapshot(rawExisting) === factsSnapshot(merged)) {
    return merged;
  }

  await prisma.metadata.update({
    where: { id: input.metadataId },
    data: { facts: merged.length > 0 ? JSON.stringify(merged) : null },
  });

  return merged;
}
