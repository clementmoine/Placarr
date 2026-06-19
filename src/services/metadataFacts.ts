import { applyConsensus } from "@/lib/metadataConsensus";
import type { FieldEvidenceInput } from "@/services/evidence";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";

export function dedupeFacts(facts?: MetadataFact[]): MetadataFact[] | undefined {
  if (!facts || facts.length === 0) return undefined;
  const seen = new Set<string>();
  const normalizedFacts = normalizeMetadataFacts(applyConsensus(facts));
  const cleanFacts = normalizedFacts
    .filter((fact) => fact.label && fact.value)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const deduped: MetadataFact[] = [];
  for (const fact of cleanFacts) {
    const key = `${fact.kind}:${fact.label}:${fact.value}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(fact);
  }

  return deduped.length > 0 ? deduped : undefined;
}

export function normalizeMetadataFacts(facts: MetadataFact[]): MetadataFact[] {
  const gameClassificationLabels = new Set([
    "PEGI",
    "ESRB",
    "CERO",
    "USK",
    "GRAC",
    "CLASS_IND",
    "ACB",
  ]);
  const normalized = facts.flatMap((fact) => {
    if (fact.kind !== "age-rating") return [fact];

    const label = fact.label.replace(/^Classification\s+/i, "").trim();
    if (
      gameClassificationLabels.has(label) &&
      label !== "PEGI" &&
      label !== "ESRB"
    ) {
      return [];
    }

    const defaultPriority = label === "PEGI" ? 100 : 60;
    return [
      {
        ...fact,
        label,
        priority: Math.max(fact.priority ?? 0, defaultPriority),
      },
    ];
  });

  const pickBestRating = (label: string) =>
    normalized
      .filter((fact) => fact.kind === "age-rating" && fact.label === label)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];

  const pegi = pickBestRating("PEGI");
  const esrb = pickBestRating("ESRB");

  return normalized.filter((fact) => {
    if (fact.kind !== "age-rating") return true;
    if (!gameClassificationLabels.has(fact.label)) return true;
    if (pegi) return fact === pegi;
    return esrb ? fact === esrb : false;
  });
}

function cleanEvidenceText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

function fieldForFact(fact: MetadataFact) {
  if (fact.kind === "rating") return "rating";
  if (fact.kind === "age-rating") return "ageRating";
  if (
    fact.kind === "time-to-beat" ||
    fact.kind === "duration" ||
    fact.kind === "completion-time"
  ) {
    return "timeToBeat";
  }
  return fact.label ? `${fact.kind}:${fact.label}` : fact.kind;
}

function fieldForAttachment(attachment: MetadataAttachment) {
  if (attachment.type === "cover") return "cover";
  return `attachment:${attachment.type}`;
}

function pushEvidence(
  evidence: FieldEvidenceInput[],
  input: FieldEvidenceInput,
) {
  const value = cleanEvidenceText(input.value);
  if (!value || !input.field || !input.source) return;
  evidence.push({
    ...input,
    value,
  });
}

export function metadataFieldEvidence(
  source: string,
  metadata: MetadataResult | null | undefined,
  options: { confidence?: number; priority?: number } = {},
): FieldEvidenceInput[] {
  if (!metadata) return [];
  const evidence: FieldEvidenceInput[] = [];
  const base = {
    source,
    confidence: options.confidence,
    priority: options.priority,
  };

  pushEvidence(evidence, {
    ...base,
    field: "title",
    value: metadata.title || "",
  });
  pushEvidence(evidence, {
    ...base,
    field: "description",
    value: metadata.description || "",
  });
  pushEvidence(evidence, {
    ...base,
    field: "releaseDate",
    value: metadata.releaseDate || "",
  });
  pushEvidence(evidence, {
    ...base,
    field: "imageUrl",
    value: metadata.imageUrl || "",
    sourceUrl: metadata.imageUrl,
  });
  pushEvidence(evidence, {
    ...base,
    field: "duration",
    value: metadata.duration?.toString() || "",
  });
  pushEvidence(evidence, {
    ...base,
    field: "pageCount",
    value: metadata.pageCount?.toString() || "",
  });
  pushEvidence(evidence, {
    ...base,
    field: "tracksCount",
    value: metadata.tracksCount?.toString() || "",
  });
  pushEvidence(evidence, {
    ...base,
    field: "barcode",
    value: metadata.barcode || "",
  });

  for (const author of metadata.authors || []) {
    pushEvidence(evidence, {
      ...base,
      field: "author",
      value: author.name,
      rawValue: author,
      sourceUrl: author.imageUrl || undefined,
    });
  }

  for (const publisher of metadata.publishers || []) {
    pushEvidence(evidence, {
      ...base,
      field: "publisher",
      value: publisher.name,
      rawValue: publisher,
      sourceUrl: publisher.imageUrl || undefined,
    });
  }

  for (const alias of metadata.aliases || []) {
    pushEvidence(evidence, {
      ...base,
      field: "alias",
      value: alias,
      rawValue: { alias },
    });
  }

  for (const regionalTitle of metadata.regionalTitles || []) {
    pushEvidence(evidence, {
      ...base,
      field: "regionalTitle",
      value: regionalTitle.text,
      region: regionalTitle.region,
      rawValue: regionalTitle,
    });
  }

  for (const fact of metadata.facts || []) {
    pushEvidence(evidence, {
      source: fact.source || source,
      field: fieldForFact(fact),
      value: fact.value,
      confidence: fact.confidence ?? options.confidence,
      priority: fact.priority ?? options.priority,
      sourceUrl: fact.url,
      rawValue: fact,
    });
  }

  for (const attachment of metadata.attachments || []) {
    pushEvidence(evidence, {
      source: attachment.source || source,
      field: fieldForAttachment(attachment),
      value: attachment.url,
      sourceUrl: attachment.url,
      rawValue: attachment,
      priority: options.priority,
    });
  }

  return evidence;
}

export function dedupeFieldEvidence(
  evidence: FieldEvidenceInput[],
): FieldEvidenceInput[] {
  const seen = new Set<string>();
  const output: FieldEvidenceInput[] = [];
  for (const item of evidence) {
    const key = [
      item.field,
      item.source,
      item.value,
      item.sourceUrl || "",
      item.region || "",
    ]
      .join("\u0000")
      .toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

export function withProviderEvidence(
  metadata: MetadataResult | null,
  source: string,
): MetadataResult | null {
  if (!metadata) return null;
  const providerEvidence = metadataFieldEvidence(source, metadata);
  return {
    ...metadata,
    fieldEvidence: dedupeFieldEvidence([
      ...(metadata.fieldEvidence || []),
      ...providerEvidence,
    ]),
  };
}
