import type {
  MediaType,
  Capability,
  ProviderInfo,
} from "@/types/providerRegistry";
import {
  isMediaType,
  isPcLikeGamePlatform,
  isMetadataProviderQuotaBlocked,
  metadataCandidatesForType,
} from "@/core/enrich/selection";
import { resolveMetadataProvidersInOrder } from "@/core/enrich/providerQueue";
import {
  orderProviderIdsForResolve,
  recordContributionsFromMergedMetadata,
} from "@/core/enrich/providerRuntimeStats";
import { runWithConcurrency } from "@/lib/async/runWithConcurrency";
import { metadataProviderResolverMap } from "@/core/catalog/bootstrap";
import { loadBarcodeAlternateNames } from "@/core/identify/alternateNames";
import { cleanCode, detectPlatformKey } from "@/core/identify/query";
import {
  normalizeProductBarcode,
  pickDiscoveredBarcode,
} from "@/core/identify/normalize";
import { discoveredBarcodeMatchesRequestedPlatform } from "@/core/enrich/discoveredBarcode";
import {
  buildGameMetadataFallbackNames,
  buildGameMetadataSearchQueries,
  buildHardwareMetadataSearchQueries,
  buildMetadataAlignmentNames,
  extractBaseTitleVariant,
  isMetadataTitleAligned,
  isGenericTitleFragment,
  shouldRecheckMetadataMatch,
  findBetterMetadataMatch,
  metadataTitleSimilarity,
  supplementGameEditionMetadata,
  descriptionMatchesRequestedTitle,
} from "@/core/enrich/titleMatching";
import {
  areDisplayTitlesSameProduct,
  requestedTitleCoversCurrentTitle,
  normalizeDisplayTitle,
  scoreMetadataDisplayTitle,
} from "@/core/enrich/titles/displayScore";
import { preferredMetadataLanguagesFromShelfName } from "@/core/enrich/shelfContentLocale";
import { buildBookMetadataSearchQueries } from "@/core/enrich/bookSearch";
import {
  supplementBookSearchAliases,
  withBookSearchAliases,
} from "@/core/enrich/bookSearchAliases";
import {
  aliasesExcludingTitle,
  collectMergedSearchAliases,
  promoteTitleKeepingAliases,
} from "@/core/enrich/aliases";
import {
  dedupeFieldEvidence,
  dedupeFacts,
  metadataFieldEvidence,
  isTimeToBeatFamilyFact,
} from "@/core/enrich/facts";
import {
  dedupeProviderExternalLinkFacts,
  externalLinkFactsFromFieldEvidence,
  appendMissingProviderExternalLinkFacts,
} from "@/core/enrich/providerExternalLinks";
import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";
import { buildBoardGameMetadataSearchQueries } from "@/core/enrich/boardGame";
import { buildPriceSearchQueries } from "@/core/commerce/pricing/searchQueries";
import {
  resolveGameMetadataPlatform,
  detectShelfGamePlatformKey,
} from "@/core/enrich/platform";
import { inferTextLanguage } from "@/core/locale/preference";
import {
  isVideoGamePlatformKey,
  detectVideoGamePlatformKey,
  videoGamePlatformTargetsPhysicalMedia,
} from "@/core/identify/platforms/platforms";
import { throwIfAborted, isAbortError } from "@/lib/http/abort";
import { listingLooksLikeMerchAccessory } from "@/core/identify/titleUtils";
import { isRetailerCoverUrlAlignedWithTitle } from "@/core/commerce/retailer/coverUrlMatch";
import type {
  MetadataAdapterContext,
  MetadataProviderAdapter,
} from "@/types/providerModule";
import {
  buildMatchContext,
  matchInputsFromMetadataResults,
  withMatchOnAdapterContext,
} from "@/core/catalog/matchContext";
import { bookIsbnBootstrapProviderIds } from "@/core/catalog/catalog";
import { AttachmentType } from "@prisma/client";
import { isHowLongToBeatFactSource } from "@/core/catalog/sourceTraits";
import { PROVIDERS } from "@/core/catalog/catalog";
import { withProviderAttachmentTraits } from "@/core/catalog/sourceTraits";
import {
  pickBestCoverFromAttachments,
  pickBestDisplayImageUrl,
  rankCoverGalleryAttachments,
} from "@/core/enrich/media/attachmentDisplayScore";
import { refineCatalogDisplayTitle } from "@/core/enrich/titles/refineCatalogDisplayTitle";
import {
  bundleTitlePartsMatchCatalogTitle,
  isBundleTitle,
} from "@/core/enrich/bundleTitle";
import { buildEditionPhraseEquivalentVariants } from "@/core/enrich/titles/searchVariants";
import {
  pickBestLocalizedDescription,
  pickBestRegionalTitle,
} from "@/core/locale/preference";
import {
  isDisplayObservation,
  isRejectedObservation,
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationEvidenceRank,
} from "@/core/enrich/observations";
import {
  factObservationRankScore,
  pickBestFactObservationsByGroup,
  pickCoverUrlFromObservations,
} from "@/core/identify/evidence/ranking";
import { coverUrlQualityRank } from "@/core/catalog/catalog";
import type {
  TitleObservation,
  TitleObservationRole,
  FactObservation,
  MetadataObservation,
} from "@/types/metadataObservation";

import { metadataHasDisplayImage } from "@/core/enrich/displayImage";
import {
  metadataResultsNeedGalleryEnrichment,
  metadataResultsHaveGameGallerySource,
} from "@/core/enrich/galleryEnrichment";
import {
  preferPinnedProviderIds,
  shouldRunScrapeMetadataPass,
} from "@/core/enrich/scrapePassGate";

export type FetchMetadataOptions = {
  isBackground?: boolean;
  shelfName?: string | null;
  queuePriority?: "high" | "normal";
  signal?: AbortSignal;
  existingScrapeProviderIds?: readonly string[];
  existingExternalIds?: Record<string, string | null>;
  existingProviderRecordUrls?: Record<string, string>;
  /**
   * Progressive store: called after the API pass and again mid-batch when the
   * merged cover (or first title snapshot) improves — does not skip providers.
   */
  onApiPassComplete?: (partial: MetadataResult) => Promise<void>;
};

function pinnedProviderIdsFromOptions(
  options?: FetchMetadataOptions,
): string[] {
  return [
    ...Object.keys(options?.existingExternalIds ?? {}),
    ...Object.keys(options?.existingProviderRecordUrls ?? {}),
  ];
}

/** Pinned fiche ids first, then dynamic runtime priority — never drops ids. */
function orderMetadataResolveIds(
  providerIds: readonly string[],
  type: MediaType,
  options?: FetchMetadataOptions,
): string[] {
  const pinned = pinnedProviderIdsFromOptions(options);
  return orderProviderIdsForResolve(
    preferPinnedProviderIds([...providerIds], pinned),
    { mediaType: type, pinnedIds: pinned },
  );
}

function createProgressiveMergePersister(input: {
  type: MediaType;
  name: string;
  barcode?: string | null;
  cleanedBarcode: string;
  resolvedPlatform?: string | null;
  shelfName?: string | null;
  providers: ProviderInfo[];
  getAlignmentNames: () => string[];
  onProgressive?: (partial: MetadataResult) => Promise<void>;
}): {
  persistFromByProvider: (
    byProvider: Map<string, MetadataResult | null>,
  ) => Promise<void>;
} {
  let lastImageUrl = "";
  let didInitialSnapshot = false;
  let chain: Promise<void> = Promise.resolve();

  const persistFromByProvider = async (
    byProvider: Map<string, MetadataResult | null>,
  ) => {
    if (!input.onProgressive) return;

    const run = async () => {
      const merged = await buildMergedMetadataFromByProvider({
        type: input.type,
        name: input.name,
        barcode: input.barcode,
        cleanedBarcode: input.cleanedBarcode,
        resolvedPlatform: input.resolvedPlatform,
        shelfName: input.shelfName,
        byProvider,
        providers: input.providers,
        alignmentNames: input.getAlignmentNames(),
      });
      if (!merged) return;

      const imageUrl = merged.imageUrl?.trim() || "";
      const hasTitle = Boolean(merged.title?.trim());
      const improvedCover = Boolean(imageUrl) && imageUrl !== lastImageUrl;
      const firstSnapshot =
        !didInitialSnapshot && (hasTitle || Boolean(imageUrl));
      if (!improvedCover && !firstSnapshot) return;

      didInitialSnapshot = true;
      lastImageUrl = imageUrl;
      recordContributionsFromMergedMetadata(merged, input.type);
      try {
        await input.onProgressive(merged);
      } catch (error) {
        console.warn(
          "[MetadataFetch] Progressive mid-batch store failed; continuing",
          error,
        );
      }
    };

    chain = chain.then(run, run);
    await chain;
  };

  return { persistFromByProvider };
}

export async function fetchMetadata(
  name: string,
  type: MediaType,
  barcode?: string | null,
  platform?: string | null,
  options?: FetchMetadataOptions,
): Promise<MetadataResult | null> {
  throwIfAborted(options?.signal);
  const resolvedPlatform =
    resolveGameMetadataPlatform(platform, options?.shelfName, type) ??
    (type === "hardware" ? detectVideoGamePlatformKey(name) ?? undefined : undefined);
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
            : type === "hardware"
              ? buildHardwareMetadataSearchQueries(name)
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
            : type === "hardware"
              ? buildHardwareMetadataSearchQueries(queryName)
              : [queryName.trim()].filter(Boolean);
  const adapterContextBase = withMatchOnAdapterContext(
    {
      type,
      name,
      barcode,
      platform: resolvedPlatform,
      shelfName: options?.shelfName,
      lookupQueries,
      // Steam (and other PC storefront adapters) gate on this; mergeMetadata also
      // uses the same flag to keep digital capsules off console shelves.
      includePcSources: isPcLikeGamePlatform(resolvedPlatform),
      isBackground: options?.isBackground,
      queuePriority:
        options?.queuePriority ?? (options?.isBackground ? "normal" : "high"),
      signal: options?.signal,
      externalIds: options?.existingExternalIds
        ? { ...options.existingExternalIds }
        : undefined,
      providerRecordUrls: options?.existingProviderRecordUrls
        ? { ...options.existingProviderRecordUrls }
        : undefined,
    },
    buildMatchContext({
      shelfType: type,
      shelfName: options?.shelfName,
      primaryTitle: name,
      titles: lookupQueries,
      barcodes: [barcode],
      platformKey: resolvedPlatform,
      externalIds: options?.existingExternalIds,
    }),
  );

  // 1. Pass 1 — API / key / none. Persist ASAP via onApiPassComplete;
  // Pass 2 scrapes only when useful fields are missing or the fiche cites scrapes.
  const apiProviders = canonicalProviders.filter(
    (p) => p.auth.kind !== "scrape",
  );
  const scrapeCanonicalProviders = canonicalProviders.filter(
    (p) => p.auth.kind === "scrape",
  );

  let alignmentNames = metadataAlignmentNames(name, []);
  const progressive = createProgressiveMergePersister({
    type,
    name,
    barcode,
    cleanedBarcode,
    resolvedPlatform,
    shelfName: options?.shelfName,
    providers,
    getAlignmentNames: () => alignmentNames,
    onProgressive: options?.onApiPassComplete,
  });

  const resolvePassOptions = {
    mediaType: type,
    onProviderResult: options?.onApiPassComplete
      ? async ({
          providerId,
          result,
        }: {
          providerId: string;
          result: MetadataResult | null;
        }) => {
          byProvider.set(providerId, result);
          await progressive.persistFromByProvider(byProvider);
        }
      : undefined,
  };

  if (apiProviders.length > 0) {
    throwIfAborted(options?.signal);
    const apiResults = await resolveMetadataProvidersInOrder(
      orderMetadataResolveIds(
        metadataProvidersReadyToResolve(apiProviders.map((p) => p.id)),
        type,
        options,
      ),
      adapterContextBase,
      metadataProviderResolverMap,
      resolvePassOptions,
    );
    for (const [id, res] of apiResults.entries()) {
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

  const barcodeAlternateNames = cleanedBarcode
    ? await loadBarcodeAlternateNames(cleanedBarcode)
    : [];
  alignmentNames = metadataAlignmentNames(name, barcodeAlternateNames);

  if (options?.onApiPassComplete && stage1Active.length > 0) {
    await progressive.persistFromByProvider(byProvider);
  }

  const scrapeCandidateIds = [
    ...scrapeCanonicalProviders,
    ...secondaryProviders.filter((p) => p.auth.kind === "scrape"),
  ].map((p) => p.id);

  const runScrapePass = shouldRunScrapeMetadataPass({
    type,
    activeResults: stage1Active,
    existingScrapeProviderIds: options?.existingScrapeProviderIds,
    candidateScrapeProviderIds: scrapeCandidateIds,
    hasCapability: stage1HasMetadataCapability,
  });

  if (runScrapePass && scrapeCanonicalProviders.length > 0) {
    throwIfAborted(options?.signal);
    const activeSoFar = Array.from(byProvider.values()).filter(
      Boolean,
    ) as MetadataResult[];
    const toResolve = scrapeCanonicalProviders.filter(
      (p) =>
        !shouldSkipRedundantBookScrapeRound(
          type,
          p,
          activeSoFar,
          options?.isBackground,
        ),
    );
    const orderedIds = orderMetadataResolveIds(
      toResolve.map((p) => p.id),
      type,
      options,
    );
    if (orderedIds.length > 0) {
      const scrapeResults = await resolveMetadataProvidersInOrder(
        metadataProvidersReadyToResolve(orderedIds),
        adapterContextBase,
        metadataProviderResolverMap,
        resolvePassOptions,
      );
      for (const [id, res] of scrapeResults.entries()) {
        byProvider.set(id, res);
      }
    }
  }

  stage1Active = Array.from(byProvider.values()).filter(
    Boolean,
  ) as MetadataResult[];

  // 2. Build accumulated context from Stage 1 results
  const stage1FallbackNames = buildGameMetadataFallbackNames(
    name,
    barcodeAlternateNames,
    alignedProviderResultsForFallback(
      byProvider,
      providers,
      alignmentNames,
      type,
    ),
  );

  const stage1ExternalIds: Record<string, string | null> = {
    ...(options?.existingExternalIds ?? {}),
  };
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
  const stage1MatchContributions = matchInputsFromMetadataResults(stage1Active);
  const stage1AdapterContext = withMatchOnAdapterContext(
    {
      ...adapterContextBase,
      imdbId,
      externalIds: stage1ExternalIds,
      fallbackNames: stage1FallbackNames,
    },
    buildMatchContext({
      shelfType: type,
      shelfName: options?.shelfName,
      primaryTitle: name,
      titles: [name, ...stage1FallbackNames, ...(stage1MatchContributions.titles ?? [])],
      barcodes: [barcode, ...(stage1MatchContributions.barcodes ?? [])],
      platformKey:
        stage1MatchContributions.platformKey ?? resolvedPlatform,
      releaseDate: stage1MatchContributions.releaseDate,
      externalIds: stage1ExternalIds,
    }),
  );

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
        shouldFetchMarketplaceListingInStage2(
          type,
          p,
          byProvider.get(p.id) ?? null,
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
        shouldSkipRedundantBookScrapeRound(
          type,
          p,
          stage1ActiveResults,
          options?.isBackground,
        )
      ) {
        return false;
      }
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
        orderMetadataResolveIds(
          toResolve.map((p) => p.id),
          type,
          options,
        ),
        stage1AdapterContext,
        metadataProviderResolverMap,
        resolvePassOptions,
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
    alignedProviderResultsForFallback(
      byProvider,
      providers,
      alignmentNames,
      type,
    ),
  );

  const finalExternalIds: Record<string, string | null> = {
    ...(options?.existingExternalIds ?? {}),
  };
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
  const finalMatchContributions = matchInputsFromMetadataResults(allActive);
  const finalAdapterContext = withMatchOnAdapterContext(
    {
      ...adapterContextBase,
      imdbId: finalImdbId,
      externalIds: finalExternalIds,
      fallbackNames: finalFallbackNames,
    },
    buildMatchContext({
      shelfType: type,
      shelfName: options?.shelfName,
      primaryTitle: name,
      titles: [name, ...finalFallbackNames, ...(finalMatchContributions.titles ?? [])],
      barcodes: [barcode, ...(finalMatchContributions.barcodes ?? [])],
      platformKey:
        finalMatchContributions.platformKey ?? resolvedPlatform,
      releaseDate: finalMatchContributions.releaseDate,
      externalIds: finalExternalIds,
    }),
  );

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
          options?.isBackground,
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
    orderMetadataResolveIds(fallbackProviderIds, type, options),
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
            ...finalAdapterContext,
            name: fallbackName,
            lookupQueries: lookupQueriesForName(fallbackName),
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
              { shelfType: type },
            ),
        },
      );

      return { providerId, resolved };
    },
  );

  for (const { providerId, resolved } of fallbackResults) {
    if (resolved) byProvider.set(providerId, resolved);
  }

  if (options?.onApiPassComplete) {
    await progressive.persistFromByProvider(byProvider);
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
            ...finalAdapterContext,
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
      finalAdapterContext,
      lookupQueriesForName,
      metadataProviderResolverMap,
      {
        imdbId: finalImdbId,
        externalIds: finalExternalIds,
        fallbackNames: finalFallbackNames,
        signal: options?.signal,
        shelfType: type,
      },
    );
  }

  // 6. Merge results generically
  const merged = await buildMergedMetadataFromByProvider({
    type,
    name,
    barcode,
    cleanedBarcode,
    resolvedPlatform,
    shelfName: options?.shelfName,
    byProvider,
    providers,
    alignmentNames,
  });
  recordContributionsFromMergedMetadata(merged, type);
  return merged;
}

async function buildMergedMetadataFromByProvider(input: {
  type: MediaType;
  name: string;
  barcode?: string | null;
  cleanedBarcode: string;
  resolvedPlatform?: string | null;
  shelfName?: string | null;
  byProvider: Map<string, MetadataResult | null>;
  providers: ProviderInfo[];
  alignmentNames: string[];
}): Promise<MetadataResult | null> {
  const {
    type,
    name,
    barcode,
    cleanedBarcode,
    resolvedPlatform,
    shelfName,
    byProvider,
    providers,
    alignmentNames,
  } = input;

  const preferredBookLanguages =
    type === "books"
      ? preferredMetadataLanguagesFromShelfName(shelfName)
      : null;
  const alignedMergeInputs = Array.from(byProvider.entries()).flatMap(
    ([providerId, metadata]) => {
      if (!metadata) return [];
      if (
        metadata.title?.trim() &&
        listingLooksLikeMerchAccessory(metadata.title, { shelfType: type }) &&
        !listingLooksLikeMerchAccessory(name, { shelfType: type })
      ) {
        return [];
      }
      if (
        !isMetadataPlatformCompatible(type, metadata, resolvedPlatform, {
          allowMissingPlatformKey:
            providers.find((p) => p.id === providerId)
              ?.platformAgnosticMetadata === true,
        })
      ) {
        // Never leak foreign-console covers/facts onto a platform shelf.
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
      // title alignment for games and hardware before merging any provider payload.
      if (
        (type === "games" || type === "hardware") &&
        metadata.title?.trim()
      ) {
        if (
          !isMetadataTitleAligned(metadata, alignmentNames, 0.58, {
            shelfType: type,
          }) ||
          isGenericTitleFragment(metadata.title, alignmentNames)
        ) {
          return [];
        }
      } else if (
        providers.find((p) => p.id === providerId)?.requiresTitleAlignment
      ) {
        if (
          !isMetadataTitleAligned(metadata, alignmentNames, 0.58, {
            shelfType: type,
          }) ||
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
      isMetadataTitleAligned({ title: catalogTitle }, alignmentNames, 0.58, {
        shelfType: type,
      })
    ) {
      if (!merged.title?.trim()) {
        finalMerged = { ...merged, title: catalogTitle };
      } else if (
        !isMetadataTitleAligned(merged, alignmentNames, 0.58, {
          shelfType: type,
        })
      ) {
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

  return preferRequestedDisplayTitle(mergedForReturn, name, {
    shelfType: type,
  });
}

export async function fetchMetadataByType(
  name: string,
  type: string,
  barcode?: string | null,
  platform?: string | null,
  options?: FetchMetadataOptions,
): Promise<MetadataResult | null> {
  if (!isMediaType(type)) return null;
  return fetchMetadata(name, type, barcode, platform, options);
}

// ── coalesced from src/core/enrich/metadataFetchGating.ts ──
/**
 * Gating + shaping helpers for the generic metadata fetch orchestrator.
 * Split out of fetch.ts so fetchMetadata reads as an orchestrator; none of
 * these call fetchMetadata, so there is no import cycle. Pure/leaf logic:
 * stage gating, title/platform alignment, book-ISBN bootstrap, game gallery
 * and edition-supplement gating.
 */

// Independent providers in the fallback / recheck / edition-supplement passes
// run concurrently under this cap. Each call is still serialized by its own
// per-provider queue (rate limits and min-intervals are honoured); the cap only
// bounds how many providers we await — and parse — at once, so a single item
// can't spike the event loop the way a full parallel fan-out would.
const METADATA_RESOLVE_CONCURRENCY = 5;

function metadataHasDescription(metadata: MetadataResult): boolean {
  return Boolean(metadata.description?.trim());
}

/** Provider already pinned a record — title recheck / fallback names won't help. */
function metadataResultIsPinnedForRecheck(result: MetadataResult): boolean {
  const externalIds = result.externalIds;
  if (
    !externalIds ||
    !Object.values(externalIds).some(
      (value) => typeof value === "string" && value.trim().length > 0,
    )
  ) {
    return false;
  }
  if (metadataHasDisplayImage(result)) return true;
  return metadataResultsHaveGameGallerySource([result]);
}

function metadataResultHasTitleAndCover(result: MetadataResult): boolean {
  return Boolean(result.title?.trim()) && metadataHasDisplayImage(result);
}

function metadataSnapshotHasTitleAndCover(
  results: Array<MetadataResult | null | undefined>,
): boolean {
  return results.some(
    (result) => result && metadataResultHasTitleAndCover(result),
  );
}

function metadataSnapshotHasPinnedGame(
  results: Array<MetadataResult | null | undefined>,
): boolean {
  return results.some((result) => {
    const externalIds = result?.externalIds;
    if (!externalIds) return false;
    return Object.values(externalIds).some(
      (value) => typeof value === "string" && value.trim().length > 0,
    );
  });
}

/** Max title-variant attempts in the metadata fallback pass (traits, not provider ids). */
function metadataFallbackQueryLimit(
  provider: ProviderInfo,
  cleanedBarcode: string,
): number {
  const throttleFallbackNames =
    provider.rateLimited ||
    provider.requiresTitleAlignment ||
    provider.slowScanScrape ||
    provider.isSecondary === true;

  if (cleanedBarcode) {
    return throttleFallbackNames ? 1 : 2;
  }
  return throttleFallbackNames ? 2 : 6;
}

/** Stage-1 canonical providers with strict quotas must not re-run the fallback pass. */
function shouldSkipRateLimitedStageOneFallback(
  provider: ProviderInfo,
  existing: MetadataResult | null | undefined,
  type: MediaType,
  activeResults: MetadataResult[],
  cleanedBarcode: string,
): boolean {
  if (provider.isSecondary || !provider.rateLimited) return false;
  if (existing && metadataResultIsPinnedForRecheck(existing)) {
    return true;
  }
  if (
    existing &&
    shouldResolveProviderForGallery(
      type,
      provider,
      existing,
      activeResults,
      cleanedBarcode,
    )
  ) {
    return false;
  }
  return true;
}

function stage1HasMetadataCapability(
  results: Array<MetadataResult | null | undefined>,
  capability: Capability,
): boolean {
  return results.some((result) => {
    if (!result) return false;
    switch (capability) {
      case "cover":
        return metadataHasDisplayImage(result);
      case "description":
        return metadataHasDescription(result);
      case "duration":
        return typeof result.duration === "number" && result.duration > 0;
      case "identify":
        return Boolean(result.title?.trim());
      case "rating":
        return Boolean(result.facts?.some((fact) => fact.kind === "rating"));
      case "releaseDate":
        return Boolean(result.releaseDate?.trim());
      case "people":
        return Boolean(
          result.authors?.length ||
            result.publishers?.length ||
            result.facts?.some((fact) => fact.kind === "person"),
        );
      case "ageRating":
        return Boolean(
          result.facts?.some((fact) => fact.kind === "age-rating"),
        );
      case "price":
        return Boolean(
          result.facts?.some(
            (fact) =>
              fact.kind === "price" ||
              fact.kind === "estimated-value" ||
              fact.kind === "observed-price",
          ),
        );
      default:
        return false;
    }
  });
}

function metadataHasBarcode(metadata: MetadataResult): boolean {
  return Boolean(cleanCode(metadata.barcode));
}

function discoveredBookBarcodeFromResults(
  results: MetadataResult[],
): string | null {
  return pickDiscoveredBarcode(
    results.flatMap((metadata) => [
      metadata.barcode,
      ...(metadata.facts || [])
        .filter((fact) => fact.kind === "identifier")
        .map((fact) => fact.value),
    ]),
  );
}

const BOOK_ISBN_BOOTSTRAP_PROVIDER_IDS = bookIsbnBootstrapProviderIds();

async function bootstrapBookProvidersWithDiscoveredIsbn(
  type: MediaType,
  name: string,
  stage1Active: MetadataResult[],
  byProvider: Map<string, MetadataResult | null>,
  options?: { isBackground?: boolean },
): Promise<void> {
  if (type !== "books") return;
  const discoveredBarcode = discoveredBookBarcodeFromResults(stage1Active);
  if (!discoveredBarcode) return;

  for (const providerId of BOOK_ISBN_BOOTSTRAP_PROVIDER_IDS) {
    const adapter = metadataProviderResolverMap.get(providerId);
    if (!adapter) continue;
    const resolved = await adapter.resolve({
      type,
      name,
      barcode: discoveredBarcode,
      isBackground: options?.isBackground,
    });
    if (resolved) byProvider.set(providerId, resolved);
  }
}

function normalizeMetadataPlatformKey(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (isVideoGamePlatformKey(trimmed)) return trimmed;
  return detectPlatformKey(trimmed);
}

function isMetadataPlatformCompatible(
  type: string,
  metadata: MetadataResult,
  platform?: string | null,
  options?: { allowMissingPlatformKey?: boolean },
): boolean {
  if (type !== "games") return true;
  const requestedPlatformKey = normalizeMetadataPlatformKey(platform);
  const resultPlatformKey = normalizeMetadataPlatformKey(metadata.platformKey);
  if (!requestedPlatformKey) return true;
  if (!resultPlatformKey) {
    // Title-only hits must not inherit a shelf console by omission.
    return options?.allowMissingPlatformKey === true;
  }
  return requestedPlatformKey === resultPlatformKey;
}

/** Drops web-only catalog hits when the shelf targets a physical release. */
function consoleShelfRejectsWebOnlyGameMetadata(
  metadata: MetadataResult,
  requestedPlatformKey: string | null,
): boolean {
  if (!videoGamePlatformTargetsPhysicalMedia(requestedPlatformKey))
    return false;
  const platformFacts = (metadata.facts ?? []).filter(
    (fact) => fact.kind === "platform",
  );
  if (platformFacts.length === 0) return false;
  return platformFacts.every((fact) => /\bweb\b/i.test(fact.value ?? ""));
}

/**
 * Capabilities the provider actually emits through its metadata adapter. Falls
 * back to `capabilities` when a provider does not distinguish the two. The
 * price/duration "chase" gating uses this so it never schedules a scrape that
 * can only deliver its data through a non-metadata flow (e.g. AchatMoinsCher's
 * price comes from the barcode/price tasks, not its metadata adapter).
 */
function metadataCapabilitiesOf(provider: ProviderInfo): Capability[] {
  return provider.metadataCapabilities ?? provider.capabilities;
}

function shouldAlwaysFetchGameGallerySource(provider: ProviderInfo): boolean {
  return Boolean(
    provider.gameMediaGallerySource ||
      provider.bookGallerySource ||
      (provider.isRealBoxCover &&
        provider.capabilities.includes("cover") &&
        provider.isSecondary),
  );
}

/**
 * Marketplace scrapes (Back Market, …) still contribute a product fiche link +
 * listing photo after stage 1 already has identify/cover from a catalog/API
 * source. Key-auth marketplaces (eBay) already bypass the scrape-cap gate;
 * keep title-search scrapes in the same boat for hardware/games.
 */
function shouldFetchMarketplaceListingInStage2(
  type: MediaType,
  provider: ProviderInfo,
  existing: MetadataResult | null | undefined,
): boolean {
  if (existing) return false;
  if (!provider.marketplaceSearchPriceSource) return false;
  if (type !== "hardware" && type !== "games") return false;
  if (provider.auth.kind !== "scrape") return false;
  const caps = metadataCapabilitiesOf(provider);
  return caps.includes("cover") || caps.includes("identify");
}

function isPlatformSpecificGameShelf(shelfName?: string | null): boolean {
  return Boolean(detectShelfGamePlatformKey(shelfName));
}

function shouldFetchGameGallerySourceInStage2(
  type: MediaType,
  provider: ProviderInfo,
  stage1NeedsGallery: boolean,
  stage1ActiveResults: MetadataResult[],
  existing: MetadataResult | null | undefined,
  cleanedBarcode: string,
  shelfName?: string | null,
): boolean {
  if (!shouldAlwaysFetchGameGallerySource(provider)) return false;
  if (type === "games" && isPlatformSpecificGameShelf(shelfName)) return true;
  if (type === "books") {
    if (!stage1NeedsGallery) return false;
    return shouldResolveProviderForGallery(
      type,
      provider,
      existing,
      stage1ActiveResults,
      cleanedBarcode,
    );
  }
  if (!stage1NeedsGallery) return false;
  return shouldResolveProviderForGallery(
    type,
    provider,
    existing,
    stage1ActiveResults,
    cleanedBarcode,
  );
}

function shouldSkipRedundantGameScrapeRound(
  type: MediaType,
  provider: ProviderInfo,
  activeResults: MetadataResult[],
  needsGallery: boolean,
  shelfName?: string | null,
  cleanedBarcode?: string,
): boolean {
  if (type !== "games") return false;
  if (needsGallery) return false;

  if (shouldAlwaysFetchGameGallerySource(provider)) {
    if (!isPlatformSpecificGameShelf(shelfName)) {
      if (metadataResultsHaveGameGallerySource(activeResults)) return true;
    }
  }

  const caps = metadataCapabilitiesOf(provider);
  if (caps.includes("duration")) return false;
  if (!metadataSnapshotHasTitleAndCover(activeResults)) return false;
  if (cleanedBarcode && !metadataSnapshotHasPinnedGame(activeResults)) {
    return false;
  }
  if (provider.auth.kind !== "scrape") return false;

  if (provider.isSecondary) return true;

  return !shouldAlwaysFetchGameGallerySource(provider);
}

/**
 * Book previews/enriches must not wait on secondary Flare/scrape retailers
 * once title+cover are already available — Decitre/Furet/Gibert/… belong in the
 * dedicated price refresh path. Holding stage slots on Flare (45–90s each)
 * makes Next's shared event loop unresponsive (Axios Network Error).
 */
function shouldSkipRedundantBookScrapeRound(
  type: MediaType,
  provider: ProviderInfo,
  activeResults: MetadataResult[],
  _isBackground?: boolean,
): boolean {
  if (type !== "books") return false;
  if (provider.auth.kind !== "scrape") return false;
  if (!provider.isSecondary) return false;
  return metadataSnapshotHasTitleAndCover(activeResults);
}

/** Secondary providers need not retry title variants when the merge snapshot is complete. */
function shouldSkipMetadataFallbackProvider(
  type: MediaType,
  provider: ProviderInfo,
  existing: MetadataResult | null | undefined,
  activeResults: MetadataResult[],
  needsGallery: boolean,
  shelfName?: string | null,
  cleanedBarcode?: string,
  isBackground?: boolean,
): boolean {
  if (existing && metadataResultIsPinnedForRecheck(existing)) {
    return true;
  }
  if (existing) return false;

  if (
    shouldSkipRedundantBookScrapeRound(
      type,
      provider,
      activeResults,
      isBackground,
    )
  ) {
    return true;
  }

  return shouldSkipRedundantGameScrapeRound(
    type,
    provider,
    activeResults,
    needsGallery,
    shelfName,
    cleanedBarcode,
  );
}

function shouldResolveProviderForGallery(
  type: MediaType,
  provider: ProviderInfo,
  existing: MetadataResult | null | undefined,
  activeResults: MetadataResult[],
  barcode: string,
): boolean {
  if (type !== "games" && type !== "books") return false;
  if (!metadataResultsNeedGalleryEnrichment(type, activeResults, barcode)) {
    return false;
  }
  if (
    !metadataCapabilitiesOf(provider).includes("cover") &&
    !shouldAlwaysFetchGameGallerySource(provider)
  ) {
    return false;
  }
  if (!existing) return true;
  if (!metadataHasDisplayImage(existing)) return true;
  if (shouldAlwaysFetchGameGallerySource(provider)) {
    return !metadataResultsHaveGameGallerySource([existing]);
  }
  return false;
}

function mergeInputWithTrait(
  mergeInputs: Array<{ providerId: string; metadata: MetadataResult }>,
  providers: ProviderInfo[],
  trait: "catalogDisplayTitleFallback",
): MetadataResult | undefined {
  for (const { providerId, metadata } of mergeInputs) {
    if (providers.find((provider) => provider.id === providerId)?.[trait]) {
      return metadata;
    }
  }
  return undefined;
}

async function resolveWithFallbackNames(
  fallbackNames: string[],
  fetcher: (query: string) => Promise<MetadataResult | null>,
  options: {
    limit?: number;
    validate?: (result: MetadataResult, query: string) => boolean;
  } = {},
): Promise<MetadataResult | null> {
  const limit = options.limit ?? 12;
  for (const query of fallbackNames.slice(0, limit)) {
    const result = await fetcher(query);
    if (!result) continue;
    if (options.validate && !options.validate(result, query)) continue;
    return result;
  }
  return null;
}

async function supplementGameEditionProviderResults(
  requestedName: string,
  byProvider: Map<string, MetadataResult | null>,
  providers: ProviderInfo[],
  adapterContextBase: MetadataAdapterContext,
  lookupQueriesForName: (queryName: string) => string[],
  metadataProviderResolverMap: Map<string, MetadataProviderAdapter>,
  context: {
    imdbId?: string | null;
    externalIds?: Record<string, string | null>;
    fallbackNames?: string[];
    signal?: AbortSignal;
    shelfType?: string | null;
  } = {},
): Promise<void> {
  const baseTitle = extractBaseTitleVariant(requestedName);
  if (!baseTitle) return;

  const alignmentNames = [requestedName, baseTitle];
  const shelfType = context.shelfType ?? adapterContextBase.type ?? "games";

  // Each provider re-searches the base title independently and writes only its
  // own entry, so run them concurrently under the shared cap.
  await runWithConcurrency(
    providers,
    METADATA_RESOLVE_CONCURRENCY,
    async (providerInfo) => {
      if (!providerInfo.capabilities.includes("identify")) return;
      if (isMetadataProviderQuotaBlocked(providerInfo.id)) return;

      const providerId = providerInfo.id;
      const adapter = metadataProviderResolverMap.get(providerId);
      if (!adapter) return;

      throwIfAborted(context.signal);

      const editionMetadata = byProvider.get(providerId) ?? null;
      if (
        editionMetadata &&
        !isMetadataTitleAligned(editionMetadata, alignmentNames, 0.58, {
          shelfType,
        })
      ) {
        return;
      }

      let baseResult: MetadataResult | null = null;
      try {
        baseResult = await adapter.resolve({
          ...adapterContextBase,
          name: baseTitle,
          lookupQueries: lookupQueriesForName(baseTitle),
          imdbId: context.imdbId,
          externalIds: context.externalIds,
          fallbackNames: context.fallbackNames,
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
        return;
      }

      if (
        !baseResult ||
        !isMetadataTitleAligned(baseResult, alignmentNames, 0.58, {
          shelfType,
        })
      ) {
        return;
      }

      const editionStub: MetadataResult = editionMetadata ?? {
        title: requestedName.trim(),
      };

      byProvider.set(
        providerId,
        supplementGameEditionMetadata(requestedName, editionStub, baseResult),
      );
    },
  );
}

function metadataAlignmentNames(
  name: string,
  barcodeAlternateNames: string[],
): string[] {
  return buildMetadataAlignmentNames(name, barcodeAlternateNames);
}

function alignedProviderResultsForFallback(
  byProvider: Map<string, MetadataResult | null>,
  providers: ProviderInfo[],
  alignmentNames: string[],
  shelfType?: string | null,
): MetadataResult[] {
  return Array.from(byProvider.entries()).flatMap(([providerId, metadata]) => {
    if (!metadata) return [];
    const providerInfo = providers.find(
      (provider) => provider.id === providerId,
    );
    if (
      providerInfo?.requiresTitleAlignment &&
      (!isMetadataTitleAligned(metadata, alignmentNames, 0.58, {
        shelfType,
      }) ||
        isGenericTitleFragment(metadata.title, alignmentNames))
    ) {
      return [];
    }
    return [metadata];
  });
}

function metadataProvidersReadyToResolve(providerIds: string[]): string[] {
  return providerIds.filter((id) => !isMetadataProviderQuotaBlocked(id));
}

export {
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
  shouldFetchMarketplaceListingInStage2,
  shouldResolveProviderForGallery,
  shouldSkipMetadataFallbackProvider,
  shouldSkipRateLimitedStageOneFallback,
  shouldSkipRedundantBookScrapeRound,
  shouldSkipRedundantGameScrapeRound,
  stage1HasMetadataCapability,
  supplementGameEditionProviderResults,
};

export { preferredMetadataLanguagesFromShelfName } from "@/core/enrich/shelfContentLocale";
export { buildBookMetadataSearchQueries } from "@/core/enrich/bookSearch";
export {
  supplementBookSearchAliases,
  withBookSearchAliases,
} from "@/core/enrich/bookSearchAliases";

// ── coalesced from src/core/enrich/merge.ts ──
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

  if (
    !isMetadataTitleAligned({ title: currentTitle }, [requestedTitle], 0.58, {
      shelfType: options?.shelfType,
    })
  ) {
    // Provider hit a different product (e.g. Pokémon OLED for a Zelda OLED
    // request). Keep the catalog name, drop covers that belong to the wrong SKU.
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
    isMetadataTitleAligned(metadata, alignmentNames, 0.58, {
      shelfType,
    })
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
              0.58,
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

// ── coalesced from src/core/enrich/mergeObservationRanking.ts ──
/**
 * Observation-based projection ranking for the merge engine: pick the best
 * display title, facts and cover image from typed provider observations
 * (role + locale tiers, cross-source consensus, cleanliness). Split out of
 * merge.ts; pure/leaf logic, no call back into mergeMetadata (no cycle).
 */

export interface ProviderMetadataInput {
  providerId: string;
  metadata: MetadataResult;
}

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

type ObservationTitleTier =
  | "object_or_catalog_with_locale"
  | "object_or_catalog"
  | "alias_or_edition"
  | "locale_hint"
  | "listing_or_user";

const OBSERVATION_TITLE_TIER_ORDER: ObservationTitleTier[] = [
  "object_or_catalog_with_locale",
  "object_or_catalog",
  "alias_or_edition",
  "locale_hint",
  "listing_or_user",
];

interface TitleCleanliness {
  punctuationCount: number;
  tokenCount: number;
  length: number;
}

interface RankedObservationTitle {
  key: string;
  value: string;
  tier: ObservationTitleTier;
  evidenceRank: number;
  cleanliness: TitleCleanliness;
}

interface AggregatedObservationTitle extends RankedObservationTitle {
  mentions: number;
}

function normalizeTitleKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function tierRank(tier: ObservationTitleTier): number {
  return OBSERVATION_TITLE_TIER_ORDER.indexOf(tier);
}

function isObjectOrCatalogRole(role: TitleObservationRole): boolean {
  return role === "object_title" || role === "catalog_title";
}

function isAliasOrEditionRole(role: TitleObservationRole): boolean {
  return role === "alias_title" || role === "edition_title";
}

function hasLocaleHint(observation: TitleObservation): boolean {
  const language = observation.language?.toLowerCase().trim();
  const hasLanguage = Boolean(language && language !== "unknown");
  const hasRegion = Boolean(observation.region?.trim());
  return hasLanguage || hasRegion;
}

function titleObservationTier(
  observation: TitleObservation,
): ObservationTitleTier {
  const localeHint = hasLocaleHint(observation);
  if (isObjectOrCatalogRole(observation.role)) {
    return localeHint ? "object_or_catalog_with_locale" : "object_or_catalog";
  }
  if (isAliasOrEditionRole(observation.role)) return "alias_or_edition";
  if (localeHint) return "locale_hint";
  return "listing_or_user";
}

function titleCleanliness(value: string): TitleCleanliness {
  const trimmed = value.trim();
  return {
    punctuationCount: (trimmed.match(/[^\p{L}\p{N}\s]/gu) || []).length,
    tokenCount: trimmed.split(/\s+/).filter(Boolean).length,
    length: trimmed.length,
  };
}

function compareTitleCleanliness(
  a: TitleCleanliness,
  b: TitleCleanliness,
): number {
  if (a.punctuationCount !== b.punctuationCount) {
    return a.punctuationCount - b.punctuationCount;
  }
  if (a.tokenCount !== b.tokenCount) {
    return a.tokenCount - b.tokenCount;
  }
  return a.length - b.length;
}

function compareCandidatePriority(
  a: RankedObservationTitle,
  b: RankedObservationTitle,
): number {
  const tierDiff = tierRank(a.tier) - tierRank(b.tier);
  if (tierDiff !== 0) return tierDiff;
  if (a.evidenceRank !== b.evidenceRank) return b.evidenceRank - a.evidenceRank;
  const cleanlinessDiff = compareTitleCleanliness(a.cleanliness, b.cleanliness);
  if (cleanlinessDiff !== 0) return cleanlinessDiff;
  return a.value.localeCompare(b.value, "en");
}

function consensusScoreForTitle(value: string, pool: string[]): number {
  if (pool.length === 0) return 0;
  const sum = pool.reduce(
    (acc, candidate) => acc + metadataTitleSimilarity(value, candidate),
    0,
  );
  return sum / pool.length;
}

function observationTitlesFromMetadata(
  metadata: MetadataResult,
): RankedObservationTitle[] {
  if (!metadata.observations?.length) return [];
  if (
    metadata.observationSchemaVersion &&
    metadata.observationSchemaVersion !== METADATA_OBSERVATION_SCHEMA_VERSION
  ) {
    return [];
  }

  const ranked: RankedObservationTitle[] = [];
  for (const observation of metadata.observations) {
    if (observation.kind !== "title") continue;
    if (!isDisplayObservation(observation)) continue;
    if (isRejectedObservation(observation)) continue;

    const value = observation.value?.trim();
    if (!value) continue;

    ranked.push({
      key: normalizeTitleKey(value),
      value,
      tier: titleObservationTier(observation),
      evidenceRank: observationEvidenceRank(observation.usage.evidence),
      cleanliness: titleCleanliness(value),
    });
  }

  return ranked;
}

function metadataObservationsFromResults(
  results: ProviderMetadataInput[],
): MetadataObservation[] {
  return results.flatMap(({ metadata }) => {
    if (!metadata.observations?.length) return [];
    if (
      metadata.observationSchemaVersion &&
      metadata.observationSchemaVersion !== METADATA_OBSERVATION_SCHEMA_VERSION
    ) {
      return [];
    }
    return metadata.observations;
  });
}

function bestProviderObservationRank(input: ProviderMetadataInput): {
  tierRank: number;
  evidenceRank: number;
} {
  const observations = metadataObservationsFromResults([input]);
  const titleObservations = observations.filter(
    (row): row is TitleObservation => row.kind === "title",
  );
  if (titleObservations.length === 0) {
    return {
      tierRank: OBSERVATION_TITLE_TIER_ORDER.length,
      evidenceRank: 0,
    };
  }

  let bestTierRank = OBSERVATION_TITLE_TIER_ORDER.length;
  let bestEvidenceRank = 0;
  for (const observation of titleObservations) {
    const candidateTierRank = tierRank(titleObservationTier(observation));
    const candidateEvidenceRank = observationEvidenceRank(
      observation.usage.evidence,
    );
    if (
      candidateTierRank < bestTierRank ||
      (candidateTierRank === bestTierRank &&
        candidateEvidenceRank > bestEvidenceRank)
    ) {
      bestTierRank = candidateTierRank;
      bestEvidenceRank = candidateEvidenceRank;
    }
  }
  return { tierRank: bestTierRank, evidenceRank: bestEvidenceRank };
}

/** Provider-neutral pre-order for merge tie-breaks (replaces per-provider weight). */
function orderResultsByObservationStrength(
  results: ProviderMetadataInput[],
): ProviderMetadataInput[] {
  return results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => {
      const rankA = bestProviderObservationRank(a.result);
      const rankB = bestProviderObservationRank(b.result);
      if (rankA.tierRank !== rankB.tierRank) {
        return rankA.tierRank - rankB.tierRank;
      }
      if (rankA.evidenceRank !== rankB.evidenceRank) {
        return rankB.evidenceRank - rankA.evidenceRank;
      }
      return a.index - b.index;
    })
    .map(({ result }) => result);
}

function pickBestMetadataObservationImageUrl(
  results: ProviderMetadataInput[],
): string | undefined {
  const observations = metadataObservationsFromResults(results);
  if (observations.length === 0) return undefined;
  return (
    pickCoverUrlFromObservations(observations, coverUrlQualityRank) ?? undefined
  );
}

function factObservationToMetadataFact(
  observation: FactObservation,
): MetadataFact {
  return {
    kind: observation.factKind,
    label: observation.label,
    value: observation.value,
    unit: observation.unit ?? undefined,
    url: observation.url ?? undefined,
    source: observation.provenance.providerId,
    priority: factObservationRankScore(observation),
  };
}

export function pickBestMetadataFactsFromObservations(
  results: ProviderMetadataInput[],
): MetadataFact[] {
  return pickBestFactObservationsByGroup(
    metadataObservationsFromResults(results),
  ).map(factObservationToMetadataFact);
}

function pickBestMetadataObservationTitle(
  results: ProviderMetadataInput[],
): string | undefined {
  const rawCandidates = results.flatMap(({ metadata }) =>
    observationTitlesFromMetadata(metadata),
  );
  if (rawCandidates.length === 0) return undefined;

  const byKey = new Map<string, AggregatedObservationTitle>();
  for (const candidate of rawCandidates) {
    const previous = byKey.get(candidate.key);
    if (!previous) {
      byKey.set(candidate.key, {
        ...candidate,
        mentions: 1,
      });
      continue;
    }

    const preferred =
      compareCandidatePriority(candidate, previous) < 0 ? candidate : previous;
    byKey.set(candidate.key, {
      ...preferred,
      mentions: previous.mentions + 1,
    });
  }

  const aggregates = Array.from(byKey.values());
  const bestTierRank = Math.min(
    ...aggregates.map((entry) => tierRank(entry.tier)),
  );
  const tierCandidates = aggregates.filter(
    (entry) => tierRank(entry.tier) === bestTierRank,
  );
  const consensusPool = rawCandidates
    .filter((entry) => tierRank(entry.tier) === bestTierRank)
    .map((entry) => entry.value);

  if (tierCandidates.length === 0) return undefined;

  return tierCandidates.slice().sort((a, b) => {
    const consensusA = consensusScoreForTitle(a.value, consensusPool);
    const consensusB = consensusScoreForTitle(b.value, consensusPool);
    if (consensusA !== consensusB) return consensusB - consensusA;

    if (a.mentions !== b.mentions) return b.mentions - a.mentions;
    if (a.evidenceRank !== b.evidenceRank)
      return b.evidenceRank - a.evidenceRank;

    const cleanlinessDiff = compareTitleCleanliness(
      a.cleanliness,
      b.cleanliness,
    );
    if (cleanlinessDiff !== 0) return cleanlinessDiff;

    if (a.value.length !== b.value.length)
      return a.value.length - b.value.length;
    return a.value.localeCompare(b.value, "en");
  })[0]?.value;
}

export {
  orderResultsByObservationStrength,
  pickBestMetadataObservationTitle,
  pickBestMetadataObservationImageUrl,
};
