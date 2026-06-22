import { AttachmentType } from "@prisma/client";
import type { MediaType } from "@/types/providerRegistry";
import { PROVIDERS } from "@/services/providerRegistry";
import {
  pickBestCoverFromAttachments,
  pickBestDisplayImageUrl,
  rankAttachmentsForDisplay,
} from "@/lib/attachmentDisplayScore";
import { pickDiscoveredBarcode } from "@/lib/barcode/normalize";
import {
  areDisplayTitlesSameProduct,
  requestedTitleCoversCurrentTitle,
  scoreMetadataDisplayTitle,
} from "@/lib/displayTitleScore";
import {
  inferTextLanguage,
  pickBestLocalizedDescription,
  pickBestRegionalTitle,
} from "@/lib/localePreference";
import { dedupeFacts, dedupeFieldEvidence } from "@/services/metadataFacts";
import type {
  MetadataAttachment,
  MetadataResult,
} from "@/types/metadataProvider";

export function pickBestMetadataTitle(
  candidates: Array<string | undefined | null>,
): string | undefined {
  const unique = Array.from(
    new Set(
      candidates
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim()),
    ),
  );
  if (unique.length === 0) return undefined;
  if (unique.length === 1) return unique[0];
  return unique.sort(
    (a, b) => scoreMetadataDisplayTitle(b) - scoreMetadataDisplayTitle(a),
  )[0];
}


function dedupePeople(
  people: Array<{ name: string; imageUrl?: string | null }>,
): Array<{ name: string; imageUrl?: string | null }> | undefined {
  if (people.length === 0) return undefined;
  const byName = new Map<string, { name: string; imageUrl?: string | null }>();
  for (const person of people) {
    const key = person.name.trim().toLowerCase();
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, person);
      continue;
    }
    if (!existing.imageUrl && person.imageUrl) {
      byName.set(key, { name: existing.name, imageUrl: person.imageUrl });
    }
  }
  const merged = Array.from(byName.values());
  return merged.length > 0 ? merged : undefined;
}


export function preferRequestedDisplayTitle(
  metadata: MetadataResult,
  requestedName: string,
): MetadataResult {
  const currentTitle = metadata.title;
  const requestedTitle = requestedName.trim();

  if (
    !currentTitle ||
    !requestedTitle ||
    currentTitle.toLowerCase().trim() === requestedTitle.toLowerCase().trim()
  ) {
    return metadata;
  }

  if (!areDisplayTitlesSameProduct(currentTitle, requestedTitle)) {
    const aliases = Array.from(
      new Set([currentTitle, ...(metadata.aliases || [])]),
    ).filter(
      (alias) =>
        alias.toLowerCase().trim() !== requestedTitle.toLowerCase().trim(),
    );

    return {
      ...metadata,
      title: requestedTitle,
      aliases: aliases.length > 0 ? aliases : undefined,
    };
  }

  if (
    scoreMetadataDisplayTitle(requestedTitle) <
      scoreMetadataDisplayTitle(currentTitle) &&
    !requestedTitleCoversCurrentTitle(requestedTitle, currentTitle)
  ) {
    return metadata;
  }

  const aliases = Array.from(
    new Set([currentTitle, ...(metadata.aliases || [])]),
  ).filter(
    (alias) =>
      alias.toLowerCase().trim() !== requestedTitle.toLowerCase().trim(),
  );

  return {
    ...metadata,
    title: requestedTitle,
    aliases: aliases.length > 0 ? aliases : undefined,
    fieldEvidence: dedupeFieldEvidence([
      ...(metadata.fieldEvidence || []),
      {
        field: "title",
        source: "RequestedDisplayTitle",
        value: requestedTitle,
        confidence: 0.62,
        priority: 180,
        rawValue: {
          previousTitle: currentTitle,
          reason: "preferred localized/requested display title",
        },
      },
    ]),
  };
}

export interface ProviderMetadataInput {
  providerId: string;
  metadata: MetadataResult;
}

export function mergeMetadata(
  mediaType: MediaType,
  results: ProviderMetadataInput[],
  options: { includePcSources?: boolean } = {},
): MetadataResult {
  const activeResults = results.filter((r) => r.metadata);
  if (activeResults.length === 0) return {};

  const resultsByWeight = [...activeResults].sort((a, b) => {
    const providerA = PROVIDERS.find((p) => p.id === a.providerId);
    const providerB = PROVIDERS.find((p) => p.id === b.providerId);
    const weightA = providerA?.weight ?? 0.5;
    const weightB = providerB?.weight ?? 0.5;
    return weightB - weightA;
  });

  const titleSources = resultsByWeight.map((r) => r.metadata);
  const title =
    pickBestRegionalTitle(titleSources) ||
    pickBestMetadataTitle(titleSources.map((source) => source.title));

  const descriptionCandidates = resultsByWeight.flatMap((r) => {
    const text = r.metadata.description;
    if (!text?.trim()) return [];
    const provider = PROVIDERS.find((p) => p.id === r.providerId);
    return [{
      text,
      language: provider?.defaultLanguage === "fr" ? "fr" : undefined,
      source: r.providerId,
    }];
  });
  const description = pickBestLocalizedDescription(descriptionCandidates);

  const releaseDate = resultsByWeight.find((r) => r.metadata.releaseDate)?.metadata.releaseDate;

  const barcode = pickDiscoveredBarcode(resultsByWeight.map((r) => r.metadata.barcode));

  const allAuthors = resultsByWeight.flatMap((r) => r.metadata.authors || []);
  const authors = allAuthors.length > 0 ? dedupePeople(allAuthors) : undefined;

  const allPublishers = resultsByWeight.flatMap((r) => r.metadata.publishers || []);
  const publishers = allPublishers.length > 0 ? dedupePeople(allPublishers) : undefined;

  const allAttachments = resultsByWeight.flatMap((r) => {
    const attachments = r.metadata.attachments || [];
    if (r.providerId === "steam" && mediaType === "games" && !options.includePcSources) {
      return [];
    }
    return attachments.map((a) => ({
      ...a,
      source: a.source || r.providerId,
    }));
  });

  const providerImageCandidates = resultsByWeight.flatMap((r) => {
    if (!r.metadata.imageUrl) return [];
    if (r.providerId === "steam" && mediaType === "games" && !options.includePcSources) {
      return [];
    }
    return [{
      type: "cover" as AttachmentType,
      url: r.metadata.imageUrl,
      source: r.providerId,
    }];
  });

  const attachments = rankAttachmentsForDisplay([
    ...allAttachments,
    ...providerImageCandidates,
  ]);

  const highestWeightResultWithImage = resultsByWeight.find((r) => r.metadata.imageUrl);
  const imageUrl =
    highestWeightResultWithImage?.providerId === "discogs"
      ? highestWeightResultWithImage.metadata.imageUrl
      : mediaType === "games"
        ? pickBestCoverFromAttachments(attachments) ||
          pickBestDisplayImageUrl(attachments)
        : pickBestDisplayImageUrl(attachments);

  const duration = resultsByWeight.find((r) => r.metadata.duration !== undefined)?.metadata.duration;
  const pageCount = resultsByWeight.find((r) => r.metadata.pageCount !== undefined)?.metadata.pageCount;
  const tracksCount = resultsByWeight.find((r) => r.metadata.tracksCount !== undefined)?.metadata.tracksCount;

  const rawFacts = resultsByWeight.flatMap((r) => r.metadata.facts || []);
  let finalFacts = rawFacts;
  const hasTimeToBeat = rawFacts.some((f) => f.kind === "time-to-beat");
  if (hasTimeToBeat) {
    finalFacts = rawFacts.filter((f) => f.kind !== "duration");
  }
  const facts = finalFacts.length > 0 ? dedupeFacts(finalFacts) : undefined;

  const rawAliases = resultsByWeight.flatMap((r) => r.metadata.aliases || []);
  const aliases = Array.from(
    new Set(rawAliases),
  ).filter(
    (alias) =>
      !title || alias.toLowerCase().trim() !== title.toLowerCase().trim(),
  );

  const externalIdsList = resultsByWeight.map((r) => r.metadata.externalIds).filter(Boolean);
  const externalIds = externalIdsList.length > 0
    ? externalIdsList.reduce<Record<string, string | null | undefined>>((acc, curr) => {
        for (const [key, val] of Object.entries(curr!)) {
          if (val && !acc[key]) {
            acc[key] = val;
          }
        }
        return acc;
      }, {})
    : undefined;

  return {
    title,
    description,
    releaseDate,
    barcode,
    authors,
    publishers,
    duration,
    pageCount,
    tracksCount,
    imageUrl,
    attachments: attachments.length > 0 ? attachments : undefined,
    aliases: aliases.length > 0 ? aliases : undefined,
    facts: facts && facts.length > 0 ? facts : undefined,
    externalIds,
  };
}
