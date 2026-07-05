import type { MediaType } from "@/types/providerRegistry";
import {
  isMediaType,
  isPcLikeGamePlatform,
  metadataCandidatesForType,
} from "@/services/metadata/selection";
import { resolveMetadataProvidersInOrder } from "@/lib/metadata/providerQueue";
import { runWithConcurrency } from "@/lib/async/runWithConcurrency";
import { metadataProviderResolverMap } from "@/services/provider/bootstrap";
import { loadBarcodeAlternateNames } from "@/lib/barcode/alternateNames";
import { cleanCode } from "@/lib/barcode/query";
import {
  buildGameMetadataFallbackNames,
  buildGameMetadataSearchQueries,
  isMetadataTitleAligned,
  isGenericTitleFragment,
  shouldRecheckMetadataMatch,
  findBetterMetadataMatch,
} from "@/lib/metadata/titleMatching";
import { isMetadataProviderQuotaBlocked } from "@/services/metadata/selection";
import {
  areDisplayTitlesSameProduct,
  requestedTitleCoversCurrentTitle,
} from "@/lib/title/displayScore";
import { aliasesExcludingTitle } from "@/lib/metadata/aliases";
import { withBookSearchAliases } from "@/lib/metadata/bookSearchAliases";
import {
  mergeMetadata,
  preferRequestedDisplayTitle,
} from "@/services/metadata/merge";
import {
  dedupeFieldEvidence,
  dedupeFacts,
  metadataFieldEvidence,
} from "@/services/metadata/facts";
import {
  dedupeProviderExternalLinkFacts,
  externalLinkFactsFromFieldEvidence,
} from "@/lib/metadata/providerExternalLinks";
import type { MetadataResult } from "@/types/metadataProvider";
import { buildBoardGameMetadataSearchQueries } from "@/lib/metadata/boardGame";
import { buildBookMetadataSearchQueries } from "@/lib/metadata/bookSearch";
import { buildPriceSearchQueries } from "@/lib/pricing/searchQueries";
import { preferredMetadataLanguagesFromShelfName } from "@/lib/metadata/shelfContentLocale";
import { resolveGameMetadataPlatform } from "@/lib/metadata/platform";
import { inferTextLanguage } from "@/lib/locale/preference";
import { throwIfAborted } from "@/lib/http/abort";

import { metadataHasDisplayImage } from "@/lib/metadata/displayImage";
import { metadataResultsNeedGalleryEnrichment } from "@/lib/metadata/galleryEnrichment";
import {
  METADATA_RESOLVE_CONCURRENCY,
  alignedProviderResultsForFallback,
  bootstrapBookProvidersWithDiscoveredIsbn,
  consoleShelfRejectsWebOnlyGameMetadata,
  isMetadataPlatformCompatible,
  mergeInputWithTrait,
  metadataAlignmentNames,
  metadataCapabilitiesOf,
  metadataFallbackQueryLimit,
  metadataHasBarcode,
  metadataProvidersReadyToResolve,
  metadataResultIsPinnedForRecheck,
  normalizeMetadataPlatformKey,
  resolveWithFallbackNames,
  shouldFetchGameGallerySourceInStage2,
  shouldResolveProviderForGallery,
  shouldSkipMetadataFallbackProvider,
  shouldSkipRateLimitedStageOneFallback,
  shouldSkipRedundantGameScrapeRound,
  stage1HasMetadataCapability,
  supplementGameEditionProviderResults,
} from "@/services/metadata/metadataFetchGating";

export async function fetchMetadata(
  name: string,
  type: MediaType,
  barcode?: string | null,
  platform?: string | null,
  options?: {
    isBackground?: boolean;
    shelfName?: string | null;
    queuePriority?: "high" | "normal";
    signal?: AbortSignal;
  },
): Promise<MetadataResult | null> {
  throwIfAborted(options?.signal);
  const resolvedPlatform = resolveGameMetadataPlatform(
    platform,
    options?.shelfName,
    type,
  );
  const providers = metadataCandidatesForType(type);
  const canonicalProviders = providers.filter((p) => !p.isSecondary);
  const secondaryProviders = providers.filter((p) => p.isSecondary);

  const byProvider = new Map<string, MetadataResult | null>();
  const cleanedBarcode = barcode ? cleanCode(barcode) : "";
  const lookupQueries =
    type === "boardgames"
      ? buildBoardGameMetadataSearchQueries(name, options?.shelfName)
      : type === "books"
        ? buildBookMetadataSearchQueries(name, options?.shelfName)
        : type === "movies" || type === "musics"
          ? buildPriceSearchQueries([name.trim()], options?.shelfName)
          : type === "games"
            ? buildGameMetadataSearchQueries(
                name,
                resolvedPlatform,
                options?.shelfName,
              )
            : [name.trim()].filter(Boolean);
  const lookupQueriesForName = (queryName: string) =>
    type === "boardgames"
      ? buildBoardGameMetadataSearchQueries(queryName, options?.shelfName)
      : type === "books"
        ? buildBookMetadataSearchQueries(queryName, options?.shelfName)
        : type === "movies" || type === "musics"
          ? buildPriceSearchQueries([queryName.trim()], options?.shelfName)
          : type === "games"
            ? buildGameMetadataSearchQueries(
                queryName,
                resolvedPlatform,
                options?.shelfName,
              )
            : [queryName.trim()].filter(Boolean);
  const adapterContextBase = {
    type,
    name,
    barcode,
    platform: resolvedPlatform,
    shelfName: options?.shelfName,
    lookupQueries,
    isBackground: options?.isBackground,
    queuePriority:
      options?.queuePriority ?? (options?.isBackground ? "normal" : "high"),
    signal: options?.signal,
  };

  // 1. Stage 1: Resolve canonical providers concurrently
  if (canonicalProviders.length > 0) {
    throwIfAborted(options?.signal);
    const canonicalResults = await resolveMetadataProvidersInOrder(
      metadataProvidersReadyToResolve(canonicalProviders.map((p) => p.id)),
      adapterContextBase,
      metadataProviderResolverMap,
    );
    for (const [id, res] of canonicalResults.entries()) {
      byProvider.set(id, res);
    }
  }

  let stage1Active = Array.from(byProvider.values()).filter(
    Boolean,
  ) as MetadataResult[];

  if (!cleanedBarcode && stage1Active.length > 0) {
    await bootstrapBookProvidersWithDiscoveredIsbn(
      type,
      name,
      stage1Active,
      byProvider,
      options,
    );
    stage1Active = Array.from(byProvider.values()).filter(
      Boolean,
    ) as MetadataResult[];
  }

  // 2. Build accumulated context from Stage 1 results
  const barcodeAlternateNames = cleanedBarcode
    ? await loadBarcodeAlternateNames(cleanedBarcode)
    : [];
  const alignmentNames = metadataAlignmentNames(name, barcodeAlternateNames);
  const stage1FallbackNames = buildGameMetadataFallbackNames(
    name,
    barcodeAlternateNames,
    alignedProviderResultsForFallback(byProvider, providers, alignmentNames),
  );

  const stage1ExternalIds: Record<string, string | null> = {};
  for (const s of stage1Active) {
    if (s.externalIds) {
      for (const [key, value] of Object.entries(s.externalIds)) {
        if (value && !stage1ExternalIds[key]) {
          stage1ExternalIds[key] = value;
        }
      }
    }
  }
  const imdbId = stage1ExternalIds.imdb;

  // 3. Stage 2: Resolve secondary providers concurrently with Stage 1 context
  if (secondaryProviders.length > 0) {
    throwIfAborted(options?.signal);
    const stage1Results = Array.from(byProvider.values());
    const stage1ActiveResults = stage1Results.filter(
      Boolean,
    ) as MetadataResult[];
    const stage1NeedsGallery = metadataResultsNeedGalleryEnrichment(
      type,
      stage1ActiveResults,
      cleanedBarcode,
    );

    const toResolve = secondaryProviders.filter((p) => {
      if (isMetadataProviderQuotaBlocked(p.id)) return false;
      if (
        shouldFetchGameGallerySourceInStage2(
          type,
          p,
          stage1NeedsGallery,
          stage1ActiveResults,
          byProvider.get(p.id) ?? null,
          cleanedBarcode,
          options?.shelfName,
        )
      ) {
        return true;
      }
      if (
        stage1NeedsGallery &&
        shouldResolveProviderForGallery(
          type,
          p,
          byProvider.get(p.id) ?? null,
          stage1ActiveResults,
          cleanedBarcode,
        )
      ) {
        return true;
      }
      if (p.auth.kind !== "scrape") return true;
      if (
        shouldSkipRedundantGameScrapeRound(
          type,
          p,
          stage1ActiveResults,
          stage1NeedsGallery,
          options?.shelfName,
          cleanedBarcode,
        )
      ) {
        return false;
      }
      const caps = metadataCapabilitiesOf(p);
      return caps.some(
        (cap) => !stage1HasMetadataCapability(stage1Results, cap),
      );
    });

    if (toResolve.length > 0) {
      const secondaryResults = await resolveMetadataProvidersInOrder(
        toResolve.map((p) => p.id),
        {
          ...adapterContextBase,
          imdbId,
          externalIds: stage1ExternalIds,
          fallbackNames: stage1FallbackNames,
        },
        metadataProviderResolverMap,
      );
      for (const [id, res] of secondaryResults.entries()) {
        byProvider.set(id, res);
      }
    }
  }

  const hasAnyResult = Array.from(byProvider.values()).some(
    (res) => res !== null,
  );
  if (!hasAnyResult) {
    return null;
  }

  // 4. Build final canonical fallback names from all successful queries
  const allActive = Array.from(byProvider.values()).filter(
    Boolean,
  ) as MetadataResult[];
  const finalFallbackNames = buildGameMetadataFallbackNames(
    name,
    barcodeAlternateNames,
    alignedProviderResultsForFallback(byProvider, providers, alignmentNames),
  );

  const finalExternalIds: Record<string, string | null> = {};
  for (const s of allActive) {
    if (s.externalIds) {
      for (const [key, value] of Object.entries(s.externalIds)) {
        if (value && !finalExternalIds[key]) {
          finalExternalIds[key] = value;
        }
      }
    }
  }
  const finalImdbId = finalExternalIds.imdb;

  // 5. Fallback Pass: retry missing search-capable providers using fallback
  // names. Gating (which providers to run) is decided once against the
  // post-stage-2 snapshot; the providers themselves are independent, so they run
  // concurrently and their results are applied in registry order to keep the
  // downstream merge deterministic regardless of completion order.
  const fallbackSnapshot = Array.from(byProvider.values()).filter(
    Boolean,
  ) as MetadataResult[];
  const fallbackNeedsGallery = metadataResultsNeedGalleryEnrichment(
    type,
    fallbackSnapshot,
    cleanedBarcode,
  );

  const fallbackProviderIds = providers
    .filter((providerInfo) => {
      if (!providerInfo.capabilities.includes("identify")) return false;
      if (isMetadataProviderQuotaBlocked(providerInfo.id)) return false;
      if (!metadataProviderResolverMap.get(providerInfo.id)) return false;

      const existing = byProvider.get(providerInfo.id);
      if (
        shouldSkipRateLimitedStageOneFallback(
          providerInfo,
          existing,
          type,
          fallbackSnapshot,
          cleanedBarcode,
        )
      ) {
        return false;
      }
      if (
        existing &&
        !shouldResolveProviderForGallery(
          type,
          providerInfo,
          existing,
          fallbackSnapshot,
          cleanedBarcode,
        )
      ) {
        return false;
      }

      if (
        shouldSkipMetadataFallbackProvider(
          type,
          providerInfo,
          existing,
          fallbackSnapshot,
          fallbackNeedsGallery,
          options?.shelfName,
          cleanedBarcode,
        )
      ) {
        return false;
      }

      return true;
    })
    .map((providerInfo) => providerInfo.id);

  // adapter.resolve already routes through the per-provider queue
  // (wrapMetadataProviderAdapter). Do NOT wrap it again in
  // runQueuedMetadataProviderCall: on a concurrency-1 provider queue the outer
  // task would hold the only slot while awaiting the inner task, which can never
  // start — a re-entrant deadlock that hangs the request.
  const fallbackResults = await runWithConcurrency(
    fallbackProviderIds,
    METADATA_RESOLVE_CONCURRENCY,
    async (providerId) => {
      throwIfAborted(options?.signal);
      const providerInfo = providers.find((p) => p.id === providerId);
      const adapter = metadataProviderResolverMap.get(providerId);
      if (!providerInfo || !adapter) return { providerId, resolved: null };

      const resolved = await resolveWithFallbackNames(
        finalFallbackNames,
        (fallbackName) =>
          adapter.resolve({
            ...adapterContextBase,
            name: fallbackName,
            lookupQueries: lookupQueriesForName(fallbackName),
            imdbId: finalImdbId,
            externalIds: finalExternalIds,
            fallbackNames: finalFallbackNames,
          }),
        {
          limit: metadataFallbackQueryLimit(providerInfo, cleanedBarcode),
          validate: (candidate, fallbackName) =>
            isMetadataTitleAligned(
              candidate,
              providerInfo.requiresTitleAlignment
                ? [name, ...barcodeAlternateNames]
                : [name, fallbackName, ...finalFallbackNames],
              0.58,
            ),
        },
      );

      return { providerId, resolved };
    },
  );

  for (const { providerId, resolved } of fallbackResults) {
    if (resolved) byProvider.set(providerId, resolved);
  }

  const recheckResults = await runWithConcurrency(
    providers.filter((p) => p.metadataMatchRecheck).map((p) => p.id),
    METADATA_RESOLVE_CONCURRENCY,
    async (providerId) => {
      throwIfAborted(options?.signal);
      const current = byProvider.get(providerId);
      if (
        !current ||
        isMetadataProviderQuotaBlocked(providerId) ||
        metadataResultIsPinnedForRecheck(current) ||
        !shouldRecheckMetadataMatch(name, current, finalFallbackNames)
      ) {
        return { providerId, improved: null };
      }
      const adapter = metadataProviderResolverMap.get(providerId);
      if (!adapter) return { providerId, improved: null };
      const improved = await findBetterMetadataMatch(
        name,
        current,
        finalFallbackNames,
        (fallbackName) =>
          adapter.resolve({
            ...adapterContextBase,
            name: fallbackName,
            lookupQueries: lookupQueriesForName(fallbackName),
          }),
      );
      return { providerId, improved };
    },
  );

  for (const { providerId, improved } of recheckResults) {
    if (improved) byProvider.set(providerId, improved);
  }

  if (type === "games") {
    throwIfAborted(options?.signal);
    await supplementGameEditionProviderResults(
      name,
      byProvider,
      providers,
      adapterContextBase,
      lookupQueriesForName,
      metadataProviderResolverMap,
      {
        imdbId: finalImdbId,
        externalIds: finalExternalIds,
        fallbackNames: finalFallbackNames,
        signal: options?.signal,
      },
    );
  }

  // 6. Merge results generically
  const preferredBookLanguages =
    type === "books"
      ? preferredMetadataLanguagesFromShelfName(options?.shelfName)
      : null;
  const alignedMergeInputs = Array.from(byProvider.entries()).flatMap(
    ([providerId, metadata]) => {
      if (!metadata) return [];
      if (!isMetadataPlatformCompatible(type, metadata, resolvedPlatform)) {
        if (
          type === "games" &&
          metadataHasDisplayImage(metadata) &&
          isMetadataTitleAligned(metadata, alignmentNames, 0.58)
        ) {
          return [
            {
              providerId,
              metadata: {
                title: metadata.title,
                imageUrl: metadata.imageUrl,
                attachments: metadata.attachments,
              },
            },
          ];
        }
        return [];
      }
      if (preferredBookLanguages && metadata.description?.trim()) {
        const descriptionLanguage = inferTextLanguage(metadata.description);
        if (
          descriptionLanguage !== "unknown" &&
          !preferredBookLanguages.includes(descriptionLanguage)
        ) {
          return [];
        }
      }
      // Name-searched retailers can return a different sequel/edition; validate
      // title alignment for games before merging any provider payload.
      if (type === "games" && metadata.title?.trim()) {
        if (
          !isMetadataTitleAligned(metadata, alignmentNames, 0.58) ||
          isGenericTitleFragment(metadata.title, alignmentNames)
        ) {
          return [];
        }
      } else if (
        providers.find((p) => p.id === providerId)?.requiresTitleAlignment
      ) {
        if (
          !isMetadataTitleAligned(metadata, alignmentNames, 0.58) ||
          isGenericTitleFragment(metadata.title, alignmentNames)
        ) {
          return [];
        }
      }
      if (
        type === "games" &&
        consoleShelfRejectsWebOnlyGameMetadata(
          metadata,
          normalizeMetadataPlatformKey(resolvedPlatform),
        )
      ) {
        return [];
      }
      return [{ providerId, metadata }];
    },
  );

  const hasNameOnlyBarcodeAnchor =
    !cleanedBarcode &&
    alignedMergeInputs.some(({ metadata }) => metadataHasBarcode(metadata));
  const mergeInputs = alignedMergeInputs.filter(({ providerId, metadata }) => {
    if (!hasNameOnlyBarcodeAnchor || type !== "books") return true;
    const providerInfo = providers.find((p) => p.id === providerId);
    if (!providerInfo?.nameDatabase) return true;

    // A broad name-only book database hit with neither barcode nor image is too
    // weak to merge once another provider has found an edition-level anchor.
    // This keeps exact-title false positives (common manga/collection names)
    // from adding unrelated authors/publishers while preserving them as a
    // fallback when no stronger provider resolved the item.
    return metadataHasBarcode(metadata) || metadataHasDisplayImage(metadata);
  });

  if (mergeInputs.length === 0) {
    return null;
  }

  const merged = mergeMetadata(type, mergeInputs, {
    includePcSources: isPcLikeGamePlatform(resolvedPlatform),
    requestedPlatformKey: resolvedPlatform,
    requestedTitle: name,
    itemBarcode: cleanedBarcode || barcode,
  });

  let finalMerged = merged;
  if (type === "games") {
    const catalogMetadata = mergeInputWithTrait(
      mergeInputs,
      providers,
      "catalogDisplayTitleFallback",
    );
    const catalogTitle = catalogMetadata?.title;
    if (
      catalogTitle &&
      isMetadataTitleAligned({ title: catalogTitle }, alignmentNames, 0.58)
    ) {
      if (!merged.title?.trim()) {
        finalMerged = { ...merged, title: catalogTitle };
      } else if (!isMetadataTitleAligned(merged, alignmentNames, 0.58)) {
        const aliases = aliasesExcludingTitle(
          catalogTitle,
          merged.title,
          ...(merged.aliases || []),
        );
        finalMerged = {
          ...merged,
          title: catalogTitle,
          aliases,
        };
      }
    }
  }

  // 7. Generate fieldEvidence dynamically
  const fieldEvidence = dedupeFieldEvidence(
    mergeInputs.flatMap(({ providerId, metadata }) => {
      const providerInfo = providers.find((p) => p.id === providerId);
      const label = providerInfo?.label || providerId;
      return metadataFieldEvidence(label, metadata);
    }),
  );

  const catalogMetadata = mergeInputWithTrait(
    mergeInputs,
    providers,
    "catalogDisplayTitleFallback",
  );
  const catalogTitleEvidence =
    catalogMetadata?.title && finalMerged.title === catalogMetadata.title
      ? metadataFieldEvidence(
          providers.find((p) => p.catalogDisplayTitleFallback)?.label ||
            "Catalog",
          { title: catalogMetadata.title },
        )
      : [];

  const aggregatedFieldEvidence = dedupeFieldEvidence([
    ...fieldEvidence,
    ...catalogTitleEvidence,
  ]);
  const factsWithProviderLinks = dedupeProviderExternalLinkFacts(
    dedupeFacts([
      ...(finalMerged.facts ?? []),
      ...externalLinkFactsFromFieldEvidence(
        aggregatedFieldEvidence,
        finalMerged.facts ?? [],
      ),
    ]) ?? [],
  );

  const mergedWithEvidence: MetadataResult = {
    ...finalMerged,
    facts:
      factsWithProviderLinks.length > 0
        ? factsWithProviderLinks
        : finalMerged.facts,
    fieldEvidence: dedupeFieldEvidence([
      ...aggregatedFieldEvidence,
      ...metadataFieldEvidence("MergedEngine", finalMerged, {
        confidence: 0.8,
        priority: 200,
      }),
    ]),
  };

  const mergedForReturn =
    type === "books"
      ? await withBookSearchAliases(mergedWithEvidence)
      : mergedWithEvidence;

  const catalogMetadataForTitle = mergeInputWithTrait(
    mergeInputs,
    providers,
    "catalogDisplayTitleFallback",
  );
  const catalogTitleForTitle = catalogMetadataForTitle?.title;
  if (
    catalogTitleForTitle &&
    finalMerged.title === catalogTitleForTitle &&
    areDisplayTitlesSameProduct(catalogTitleForTitle, name) &&
    !requestedTitleCoversCurrentTitle(name, catalogTitleForTitle)
  ) {
    const requestedTitle = name.trim();
    const aliases = aliasesExcludingTitle(
      catalogTitleForTitle,
      requestedTitle,
      ...(mergedForReturn.aliases || []),
    );
    return {
      ...mergedForReturn,
      aliases,
    };
  }

  return preferRequestedDisplayTitle(mergedForReturn, name);
}

export async function fetchMetadataByType(
  name: string,
  type: string,
  barcode?: string | null,
  platform?: string | null,
  options?: {
    isBackground?: boolean;
    shelfName?: string | null;
    queuePriority?: "high" | "normal";
    signal?: AbortSignal;
  },
): Promise<MetadataResult | null> {
  if (!isMediaType(type)) return null;
  return fetchMetadata(name, type, barcode, platform, options);
}
