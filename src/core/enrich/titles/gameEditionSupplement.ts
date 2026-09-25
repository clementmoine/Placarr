/**
 * Merge a game edition stub onto a base metadata result.
 */
import { pickBestCoverFromAttachments } from "@/core/enrich/media/attachmentDisplayScore";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";

function pickRicherDescription(
  edition?: string | null,
  base?: string | null,
): string | undefined {
  const editionText = edition?.trim();
  const baseText = base?.trim();
  if (!editionText) return baseText || undefined;
  if (!baseText) return editionText;
  return editionText.length >= baseText.length ? editionText : baseText;
}

function mergeEditionAttachments(
  edition?: MetadataAttachment[],
  base?: MetadataAttachment[],
): MetadataAttachment[] | undefined {
  const combined = [...(edition || []), ...(base || [])];
  if (combined.length === 0) return undefined;

  const seen = new Set<string>();
  const merged: MetadataAttachment[] = [];
  for (const attachment of combined) {
    const key = attachment.url.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(attachment);
  }
  return merged.length > 0 ? merged : undefined;
}

function mergeEditionFacts(
  edition?: MetadataFact[],
  base?: MetadataFact[],
): MetadataFact[] | undefined {
  const combined = [...(edition || []), ...(base || [])];
  if (combined.length === 0) return undefined;

  const seen = new Set<string>();
  const merged: MetadataFact[] = [];
  for (const fact of combined) {
    if (!fact.label?.trim() || !fact.value?.trim()) continue;
    const key = `${fact.kind}:${fact.label}:${fact.value}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(fact);
  }
  return merged.length > 0 ? merged : undefined;
}

export function supplementGameEditionMetadata(
  requestedName: string,
  edition: MetadataResult,
  base: MetadataResult,
): MetadataResult {
  const title =
    edition.title?.trim() || requestedName.trim() || base.title?.trim();
  const attachments = mergeEditionAttachments(
    edition.attachments,
    base.attachments,
  );

  return {
    ...base,
    ...edition,
    title,
    description: pickRicherDescription(edition.description, base.description),
    facts: mergeEditionFacts(edition.facts, base.facts),
    imageUrl:
      pickBestCoverFromAttachments(attachments ?? []) ||
      base.imageUrl?.trim() ||
      edition.imageUrl?.trim(),
    heroImageUrl: edition.heroImageUrl?.trim() || base.heroImageUrl,
    attachments,
    aliases: Array.from(
      new Set(
        [
          ...(edition.aliases || []),
          ...(base.aliases || []),
          title,
          base.title,
        ].filter((value): value is string => Boolean(value?.trim())),
      ),
    ),
    regionalTitles:
      (edition.regionalTitles?.length ?? 0) > 0
        ? edition.regionalTitles
        : base.regionalTitles,
    externalIds: { ...base.externalIds, ...edition.externalIds },
  };
}
