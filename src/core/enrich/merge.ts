/**
 * Merge provider metadata results into a single MetadataResult.
 */
import type { MediaType } from "@/types/providerRegistry";
import { PROVIDERS } from "@/core/catalog/catalog";
import { withProviderAttachmentTraits } from "@/core/catalog/sourceTraits";
import {
  pickBestCoverFromAttachments,
  pickBestDisplayImageUrl,
  rankCoverGalleryAttachments,
} from "@/core/enrich/media/attachmentDisplayScore";
import { refineCatalogDisplayTitle } from "@/core/enrich/titles/refineCatalogDisplayTitle";
import {
  collectMergedSearchAliases,
  promoteTitleKeepingAliases,
} from "@/core/enrich/aliases";
import {
  dedupeFieldEvidence,
  dedupeFacts,
  isTimeToBeatFamilyFact,
} from "@/core/enrich/facts";
import {
  dedupeProviderExternalLinkFacts,
  appendMissingProviderExternalLinkFacts,
} from "@/core/enrich/providerExternalLinks";
import {
  descriptionMatchesRequestedTitle,
  isMetadataTitleAligned,
} from "@/core/enrich/titleMatching";
import {
  bundleTitlePartsMatchCatalogTitle,
  isBundleTitle,
} from "@/core/enrich/bundleTitle";
import { buildEditionPhraseEquivalentVariants } from "@/core/enrich/titles/searchVariants";
import {
  requestedTitleCoversCurrentTitle,
  scoreMetadataDisplayTitle,
} from "@/core/enrich/titles/displayScore";
import { usesPrintSearch } from "@/lib/printSearchTypes";
import {
  pickBestLocalizedDescription,
  pickBestRegionalTitle,
} from "@/core/locale/preference";
import {
  normalizeProductBarcode,
  pickDiscoveredBarcode,
} from "@/core/identify/normalize";
import { discoveredBarcodeMatchesRequestedPlatform } from "@/core/enrich/discoveredBarcode";
import { isRetailerCoverUrlAlignedWithTitle } from "@/core/commerce/retailer/coverUrlMatch";
import { isHowLongToBeatFactSource } from "@/core/catalog/sourceTraits";
import { AttachmentType } from "@/generated/prisma/browser";
import type { MetadataResult } from "@/types/metadataProvider";
import {
  orderResultsByObservationStrength,
  pickBestMetadataFactsFromObservations,
  pickBestMetadataObservationImageUrl,
  pickBestMetadataObservationTitle,
  pickBestMetadataTitle,
  type ProviderMetadataInput,
} from "@/core/enrich/mergeObservationRanking";

export type { ProviderMetadataInput } from "@/core/enrich/mergeObservationRanking";
export {
  pickBestMetadataTitle,
  pickBestMetadataFactsFromObservations,
  orderResultsByObservationStrength,
  pickBestMetadataObservationTitle,
  pickBestMetadataObservationImageUrl,
} from "@/core/enrich/mergeObservationRanking";
import { METADATA_TITLE_ALIGN_FLOOR } from "@/core/enrich/titles/identityThresholds";

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

function stripCoversMisalignedWithRequestedTitle(
  metadata: MetadataResult,
  requestedTitle: string,
): MetadataResult {
  const imageUrl = metadata.imageUrl?.trim();
  const keepImageUrl =
    imageUrl && isRetailerCoverUrlAlignedWithTitle(imageUrl, requestedTitle)
      ? imageUrl
      : undefined;
  const attachments = metadata.attachments?.filter((attachment) => {
    if (!attachment.url) return false;
    if (
      attachment.type === "cover" ||
      attachment.type === "image" ||
      !attachment.type
    ) {
      return isRetailerCoverUrlAlignedWithTitle(attachment.url, requestedTitle);
    }
    return true;
  });
  return {
    ...metadata,
    imageUrl: keepImageUrl,
    attachments:
      attachments && attachments.length > 0 ? attachments : undefined,
  };
}

export function preferRequestedDisplayTitle(
  metadata: MetadataResult,
  requestedName: string,
  options?: { shelfType?: string | null },
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

  // Print shelves: the "requested" string is often a collector code (`TFC#001`),
  // not a display title. A catalog printKey means the provider hit the right
  // printing — keep its name (do not overwrite Ariel with TFC#001).
  if (
    usesPrintSearch(options?.shelfType) ||
    Boolean(metadata.externalIds?.printKey?.trim())
  ) {
    return metadata;
  }

  if (
    !isMetadataTitleAligned(
      { title: currentTitle },
      [requestedTitle],
      METADATA_TITLE_ALIGN_FLOOR,
      {
        shelfType: options?.shelfType,
      },
    )
  ) {
    // Provider hit a different product (e.g. Pokémon OLED for a Zelda OLED
    // request). Prefer the collector's requested name and drop covers that
    // belong to the wrong SKU.
    return stripCoversMisalignedWithRequestedTitle(
      {
        ...metadata,
        title: requestedTitle,
        aliases: promoteTitleKeepingAliases(metadata, requestedTitle),
      },
      requestedTitle,
    );
  }

  if (
    scoreMetadataDisplayTitle(requestedTitle) <
      scoreMetadataDisplayTitle(currentTitle) &&
    !requestedTitleCoversCurrentTitle(requestedTitle, currentTitle)
  ) {
    return metadata;
  }

  return {
    ...metadata,
    title: requestedTitle,
    aliases: promoteTitleKeepingAliases(metadata, requestedTitle),
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

function metadataHasCover(metadata: MetadataResult): boolean {
  return Boolean(
    metadata.imageUrl ||
    metadata.attachments?.some((attachment) => attachment.type === "cover"),
  );
}

function providerMetadataAlignsForGallery(
  requestedTitle: string | null | undefined,
  metadata: MetadataResult,
  shelfType?: string | null,
): boolean {
  const requested = requestedTitle?.trim();
  if (!requested) return true;

  // Print lookup codes (`TFC#002`) do not align with catalog titles; the cover
  // still belongs to the resolved printing when printKey is present.
  if (
    usesPrintSearch(shelfType) ||
    Boolean(metadata.externalIds?.printKey?.trim())
  ) {
    return true;
  }

  const catalogTitle = metadata.title?.trim();
  if (!catalogTitle) return false;

  const alignmentNames = [
    requested,
    ...buildEditionPhraseEquivalentVariants(requested),
  ];
  // Use aliases + regionalTitles too — LaunchBox often keeps the EN primary
  // title while the FR shelf name only appears as an alternate (Oddworld,
  // Atlantide, Need for Speed "Road & Track Presents…").
  // Pass shelfType so hardware residual accepts finish synonyms
  // ("Slim Rose" ↔ "System [Pink]") the same way merge title gates do.
  if (
    isMetadataTitleAligned(
      metadata,
      alignmentNames,
      METADATA_TITLE_ALIGN_FLOOR,
      {
        shelfType,
      },
    )
  ) {
    return true;
  }

  if (isBundleTitle(requested)) {
    return bundleTitlePartsMatchCatalogTitle(
      requested,
      catalogTitle,
      metadata.aliases ?? [],
    );
  }

  return false;
}

function bookCoverPriorityFor(providerId: string) {
  return PROVIDERS.find((provider) => provider.id === providerId)
    ?.bookCoverPriority;
}

function withoutSecondaryBookCoverSources(
  mediaType: MediaType,
  results: ProviderMetadataInput[],
): ProviderMetadataInput[] {
  if (mediaType !== "books") return results;

  const hasPrimaryBookCover = results.some(
    (result) =>
      bookCoverPriorityFor(result.providerId) === "primary" &&
      metadataHasCover(result.metadata),
  );
  if (!hasPrimaryBookCover) return results;

  return results.map((result) => {
    if (bookCoverPriorityFor(result.providerId) !== "secondary") return result;
    const { imageUrl: _imageUrl, attachments, ...rest } = result.metadata;
    const filteredAttachments = attachments?.map((attachment) =>
      attachment.type === "cover"
        ? { ...attachment, type: "image" as const }
        : attachment,
    );
    return {
      ...result,
      metadata: {
        ...rest,
        imageUrl: undefined,
        attachments:
          filteredAttachments && filteredAttachments.length > 0
            ? filteredAttachments
            : undefined,
      },
    };
  });
}

export function mergeMetadata(
  mediaType: MediaType,
  results: ProviderMetadataInput[],
  options: {
    includePcSources?: boolean;
    requestedPlatformKey?: string | null;
    requestedTitle?: string | null;
    itemBarcode?: string | null;
  } = {},
): MetadataResult {
  const activeResults = withoutSecondaryBookCoverSources(
    mediaType,
    results.filter((r) => r.metadata),
  );
  if (activeResults.length === 0) return {};

  const orderedResults = orderResultsByObservationStrength(activeResults);

  const titleSources = orderedResults.map((r) => r.metadata);
  const observedTitle = pickBestMetadataObservationTitle(orderedResults);
  const preliminaryTitle =
    observedTitle ||
    pickBestRegionalTitle(titleSources) ||
    pickBestMetadataTitle(titleSources.map((source) => source.title));
  const catalogTitleCandidates = orderedResults.flatMap((result) => [
    result.metadata.title,
    ...(result.metadata.aliases || []),
    ...(result.metadata.regionalTitles || []).map((entry) => entry.text),
    preliminaryTitle,
  ]);
  const title = preliminaryTitle
    ? refineCatalogDisplayTitle(
        preliminaryTitle,
        catalogTitleCandidates,
        options.itemBarcode ?? options.requestedTitle,
      )
    : preliminaryTitle;

  const descriptionCandidates = orderedResults.flatMap((r) => {
    const text = r.metadata.description;
    if (!text?.trim()) return [];
    const provider = PROVIDERS.find((p) => p.id === r.providerId);
    // Price / identify scrapers may invent empty prose in tests; only merge
    // descriptions from providers that declare the capability.
    if (!provider?.capabilities.includes("description")) return [];
    if (
      mediaType === "games" &&
      options.requestedTitle &&
      !descriptionMatchesRequestedTitle(options.requestedTitle, text)
    ) {
      return [];
    }
    return [
      {
        text,
        language: provider.defaultLanguage === "fr" ? "fr" : undefined,
        source: r.providerId,
      },
    ];
  });
  const description = pickBestLocalizedDescription(descriptionCandidates);

  const releaseDate = orderedResults.find((r) => r.metadata.releaseDate)
    ?.metadata.releaseDate;

  const scannedBarcode = normalizeProductBarcode(options.itemBarcode ?? null);
  const barcodeCandidates =
    options.requestedTitle?.trim() && mediaType === "games"
      ? orderedResults.filter((r) => {
          if (!r.metadata.barcode || !r.metadata.title) return false;
          if (
            !isMetadataTitleAligned(
              { title: r.metadata.title },
              [options.requestedTitle!.trim()],
              METADATA_TITLE_ALIGN_FLOOR,
              { shelfType: mediaType },
            )
          ) {
            return false;
          }
          // The user's own scan is ground truth — never platform-gate it.
          if (
            scannedBarcode &&
            normalizeProductBarcode(r.metadata.barcode) === scannedBarcode
          ) {
            return true;
          }
          return discoveredBarcodeMatchesRequestedPlatform(
            r.metadata,
            options.requestedPlatformKey,
          );
        })
      : orderedResults;
  const barcode = pickDiscoveredBarcode(
    barcodeCandidates.map((r) => r.metadata.barcode),
  );

  const allAuthors = orderedResults.flatMap((r) => r.metadata.authors || []);
  const authors = allAuthors.length > 0 ? dedupePeople(allAuthors) : undefined;

  const allPublishers = orderedResults.flatMap(
    (r) => r.metadata.publishers || [],
  );
  const publishers =
    allPublishers.length > 0 ? dedupePeople(allPublishers) : undefined;

  const providerInfo = (providerId: string) =>
    PROVIDERS.find((p) => p.id === providerId);
  // Digital-storefront art (e.g. Steam PC capsules) misrepresents a physical
  // console scan, so drop it from the game cover set unless PC sources are asked
  // for. Trait-driven (provider-declared), not a hardcoded provider name.
  const excludesDigitalStorefrontArt = (providerId: string) =>
    Boolean(providerInfo(providerId)?.digitalStorefrontArt) &&
    mediaType === "games" &&
    !options.includePcSources;

  const galleryResults = options.requestedTitle?.trim()
    ? orderedResults.filter((result) =>
        providerMetadataAlignsForGallery(
          options.requestedTitle,
          result.metadata,
          mediaType,
        ),
      )
    : orderedResults;

  const allAttachments = galleryResults.flatMap((r) => {
    const attachments = r.metadata.attachments || [];
    if (excludesDigitalStorefrontArt(r.providerId)) {
      return [];
    }
    return attachments.map((a) =>
      withProviderAttachmentTraits({
        ...a,
        source: a.source || r.providerId,
      }),
    );
  });

  const providerImageCandidates = galleryResults.flatMap((r) => {
    if (!r.metadata.imageUrl) return [];
    if (excludesDigitalStorefrontArt(r.providerId)) {
      return [];
    }
    const matchingAttachment = r.metadata.attachments?.find(
      (attachment) => attachment.url === r.metadata.imageUrl,
    );
    return [
      withProviderAttachmentTraits({
        type: matchingAttachment?.type ?? ("cover" as AttachmentType),
        url: r.metadata.imageUrl,
        role: matchingAttachment?.role,
        source: matchingAttachment?.source || r.providerId,
        title: matchingAttachment?.title,
      }),
    ];
  });

  const displayScoreOptions = {
    requestedPlatformKey: options.requestedPlatformKey,
  };

  const combined = [...allAttachments, ...providerImageCandidates];
  const rankedCovers = rankCoverGalleryAttachments(
    combined,
    undefined,
    displayScoreOptions,
  );
  const rankedCoverUrls = new Set(
    rankedCovers.map((attachment) => attachment.url).filter(Boolean),
  );
  const trailing = combined.filter(
    (attachment) => attachment.url && !rankedCoverUrls.has(attachment.url),
  );
  const attachments = [...rankedCovers, ...trailing];

  const leadingCoverResults = options.requestedTitle?.trim()
    ? galleryResults
    : orderedResults;
  const leadingResultWithImage = leadingCoverResults.find(
    (r) => r.metadata.imageUrl,
  );
  const observedImageUrl =
    pickBestMetadataObservationImageUrl(leadingCoverResults);
  // A provider whose cover is canonical for its media type (e.g. Discogs album
  // art) is trusted as-is when it leads, rather than re-ranked.
  const imageUrl =
    leadingResultWithImage &&
    providerInfo(leadingResultWithImage.providerId)?.canonicalCover
      ? leadingResultWithImage.metadata.imageUrl
      : (observedImageUrl ??
        (pickBestCoverFromAttachments(
          combined,
          undefined,
          displayScoreOptions,
        ) ||
          pickBestDisplayImageUrl(combined)));

  const duration = orderedResults.find((r) => r.metadata.duration !== undefined)
    ?.metadata.duration;
  const pageCount = orderedResults.find(
    (r) => r.metadata.pageCount !== undefined,
  )?.metadata.pageCount;
  const tracksCount = orderedResults.find(
    (r) => r.metadata.tracksCount !== undefined,
  )?.metadata.tracksCount;

  const rawFacts = orderedResults.flatMap((r) => r.metadata.facts || []);
  const observedFacts = pickBestMetadataFactsFromObservations(orderedResults);
  let finalFacts =
    observedFacts.length > 0 ? [...observedFacts, ...rawFacts] : rawFacts;
  // Arbitrage temps de jeu : si une source time-to-beat AUTORITAIRE (trait
  // registry `timeToBeatSource`, ex. How Long to Beat) fournit des durées, les
  // durées des autres sources (IGDB…) sont écartées — l'ancien filtre par
  // `kind` gardait la mauvaise génération.
  const hasAuthoritativeTime = finalFacts.some(
    (f) => isTimeToBeatFamilyFact(f) && isHowLongToBeatFactSource(f.source),
  );
  if (hasAuthoritativeTime) {
    finalFacts = finalFacts.filter(
      (f) => !isTimeToBeatFamilyFact(f) || isHowLongToBeatFactSource(f.source),
    );
  }
  finalFacts = dedupeProviderExternalLinkFacts(
    appendMissingProviderExternalLinkFacts(finalFacts, orderedResults),
  );
  const facts = finalFacts.length > 0 ? dedupeFacts(finalFacts) : undefined;

  const aliases = collectMergedSearchAliases(
    orderedResults.map((r) => r.metadata),
    title ?? "",
    options.requestedTitle,
  );

  const externalIdsList = orderedResults
    .map((r) => r.metadata.externalIds)
    .filter(Boolean);
  const externalIds =
    externalIdsList.length > 0
      ? externalIdsList.reduce<Record<string, string | null | undefined>>(
          (acc, curr) => {
            for (const [key, val] of Object.entries(curr!)) {
              if (val && !acc[key]) {
                acc[key] = val;
              }
            }
            return acc;
          },
          {},
        )
      : undefined;

  const platformKey =
    orderedResults.find((r) => r.metadata.platformKey)?.metadata.platformKey ??
    options.requestedPlatformKey ??
    undefined;

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
    platformKey,
    imageUrl,
    attachments: attachments.length > 0 ? attachments : undefined,
    aliases,
    facts: facts && facts.length > 0 ? facts : undefined,
    externalIds,
  };
}
