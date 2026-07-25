import type { MediaType, ProviderInfo } from "@/types/providerRegistry";
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
import { cleanCode } from "@/core/identify/query";
import {
  buildGameMetadataFallbackNames,
  buildGameMetadataSearchQueries,
  buildHardwareMetadataSearchQueries,
  isMetadataTitleAligned,
  isGenericTitleFragment,
  shouldRecheckMetadataMatch,
  findBetterMetadataMatch,
} from "@/core/enrich/titleMatching";
import {
  areDisplayTitlesSameProduct,
  requestedTitleCoversCurrentTitle,
} from "@/core/enrich/titles/displayScore";
import { preferredMetadataLanguagesFromShelfName } from "@/core/enrich/shelfContentLocale";
import { buildBookMetadataSearchQueries } from "@/core/enrich/bookSearch";
import { withBookSearchAliases } from "@/core/enrich/bookSearchAliases";
import { aliasesExcludingTitle } from "@/core/enrich/aliases";
import {
  dedupeFieldEvidence,
  dedupeFacts,
  metadataFieldEvidence,
} from "@/core/enrich/facts";
import {
  dedupeProviderExternalLinkFacts,
  externalLinkFactsFromFieldEvidence,
} from "@/core/enrich/providerExternalLinks";
import { CACHED_FICHE_MERGE_KEY } from "@/core/enrich/internalMergeKeys";
import type { MetadataResult } from "@/types/metadataProvider";
import { buildBoardGameMetadataSearchQueries } from "@/core/enrich/boardGame";
import { buildPriceSearchQueries } from "@/core/commerce/pricing/searchQueries";
import { resolveGameMetadataPlatform } from "@/core/enrich/platform";
import { inferTextLanguage } from "@/core/locale/preference";
import { detectVideoGamePlatformKey } from "@/core/identify/platforms/platforms";
import { throwIfAborted } from "@/lib/http/abort";
import { listingLooksLikeMerchAccessory } from "@/core/identify/titleUtils";
import type { RomChecksums } from "@/types/providerModule";
import {
  buildMatchContext,
  matchInputsFromMetadataResults,
  withMatchOnAdapterContext,
} from "@/core/catalog/matchContext";

import { metadataHasDisplayImage } from "@/core/enrich/displayImage";
import { metadataResultsNeedGalleryEnrichment } from "@/core/enrich/galleryEnrichment";
import {
  apiProvidersForMetadataPass,
  preferPinnedProviderIds,
  scrapeProvidersForMetadataPass,
  shouldRunScrapeMetadataPass,
  metadataPassCapabilitiesIncomplete,
} from "@/core/enrich/scrapePassGate";
import { normalizeRomChecksums } from "@/core/enrich/romChecksums";

export type FetchMetadataOptions = {
  isBackground?: boolean;
  shelfName?: string | null;
  queuePriority?: "high" | "normal";
  signal?: AbortSignal;
  existingScrapeProviderIds?: readonly string[];
  existingExternalIds?: Record<string, string | null>;
  existingProviderRecordUrls?: Record<string, string>;
  /**
   * ROM dump hashes when known (API preview / prior identifier facts).
   * Tier0 dump providers prefer these over title search.
   */
  romChecksums?: RomChecksums;
  /**
   * Prior fiche snapshot (e.g. DB row on force-refresh). Used for capability
   * gating so Tier 0+1 does not blank-slate when identify+cover already exist.
   */
  seededActiveResults?: MetadataResult[];
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
        await input.onProgressive?.(merged);
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
    (type === "hardware"
      ? (detectVideoGamePlatformKey(name) ?? undefined)
      : undefined);
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
      romChecksums: normalizeRomChecksums(options?.romChecksums),
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

  // 1. Pass 1 — API / key / none. Seed from prior fiche when force-refreshing so
  // we gap-fill instead of blank-slating Tier 0+1. Persist ASAP via onApiPassComplete;
  // Pass 2 scrapes only when useful fields are missing or the fiche cites scrapes.
  const apiProviders = canonicalProviders.filter(
    (p) => p.auth.kind !== "scrape",
  );
  const scrapeCanonicalProviders = canonicalProviders.filter(
    (p) => p.auth.kind === "scrape",
  );
  const seededActiveResults = (options?.seededActiveResults ?? []).filter(
    (result) => Boolean(result?.title?.trim() || result?.imageUrl?.trim()),
  );
  const scrapeIdsOf = new Set(
    providers.filter((p) => p.auth.kind === "scrape").map((p) => p.id),
  );
  const pinnedNonScrapeProviderIds = pinnedProviderIdsFromOptions(
    options,
  ).filter((id) => !scrapeIdsOf.has(id));

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

  const apiIdsAllowed = new Set(
    apiProvidersForMetadataPass({
      type,
      activeResults: seededActiveResults,
      candidateApiProviderIds: apiProviders.map((p) => p.id),
      pinnedNonScrapeProviderIds,
      hasCapability: stage1HasMetadataCapability,
    }),
  );
  const apiProvidersToResolve = apiProviders.filter((p) =>
    apiIdsAllowed.has(p.id),
  );

  if (apiProvidersToResolve.length > 0) {
    throwIfAborted(options?.signal);
    const apiResults = await resolveMetadataProvidersInOrder(
      orderMetadataResolveIds(
        metadataProvidersReadyToResolve(apiProvidersToResolve.map((p) => p.id)),
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

  let stage1Active = [
    ...seededActiveResults,
    ...(Array.from(byProvider.values()).filter(Boolean) as MetadataResult[]),
  ];

  if (!cleanedBarcode && stage1Active.length > 0) {
    await bootstrapBookProvidersWithDiscoveredIsbn(
      type,
      name,
      stage1Active,
      byProvider,
      options,
    );
    stage1Active = [
      ...seededActiveResults,
      ...(Array.from(byProvider.values()).filter(Boolean) as MetadataResult[]),
    ];
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

  const scrapePassOptions = {
    type,
    activeResults: stage1Active,
    existingScrapeProviderIds: options?.existingScrapeProviderIds,
    candidateScrapeProviderIds: scrapeCandidateIds,
    hasCapability: stage1HasMetadataCapability,
  };
  const scrapeIdsAllowed = new Set(
    scrapeProvidersForMetadataPass(scrapePassOptions),
  );
  const runScrapePass = shouldRunScrapeMetadataPass(scrapePassOptions);

  if (runScrapePass && scrapeCanonicalProviders.length > 0) {
    throwIfAborted(options?.signal);
    const activeSoFar = Array.from(byProvider.values()).filter(
      Boolean,
    ) as MetadataResult[];
    const toResolve = scrapeCanonicalProviders.filter(
      (p) =>
        scrapeIdsAllowed.has(p.id) &&
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

  stage1Active = [
    ...seededActiveResults,
    ...(Array.from(byProvider.values()).filter(Boolean) as MetadataResult[]),
  ];

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
      titles: [
        name,
        ...stage1FallbackNames,
        ...(stage1MatchContributions.titles ?? []),
      ],
      barcodes: [barcode, ...(stage1MatchContributions.barcodes ?? [])],
      platformKey: stage1MatchContributions.platformKey ?? resolvedPlatform,
      releaseDate: stage1MatchContributions.releaseDate,
      externalIds: stage1ExternalIds,
    }),
  );

  // 3. Stage 2: Resolve secondary providers concurrently with Stage 1 context
  if (secondaryProviders.length > 0) {
    throwIfAborted(options?.signal);
    const stage1Results = [
      ...seededActiveResults,
      ...Array.from(byProvider.values()),
    ];
    const stage1ActiveResults = stage1Results.filter(
      Boolean,
    ) as MetadataResult[];
    const stage1NeedsGallery = metadataResultsNeedGalleryEnrichment(
      type,
      stage1ActiveResults,
      cleanedBarcode,
    );
    const stage1CapabilitiesIncomplete = metadataPassCapabilitiesIncomplete({
      type,
      activeResults: stage1ActiveResults,
      hasCapability: stage1HasMetadataCapability,
    });

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
          stage1ActiveResults,
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
      // Seed/Tier0+1 already complete — do not wake non-scrape secondaries.
      if (p.auth.kind !== "scrape") {
        if (!stage1CapabilitiesIncomplete) return false;
        return true;
      }
      if (!scrapeIdsAllowed.has(p.id)) return false;
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
    // Force-refresh with a complete seed and no pinned scrapes/API pins to hit.
    return seededActiveResults[0] ?? null;
  }

  if (seededActiveResults[0]) {
    byProvider.set(CACHED_FICHE_MERGE_KEY, seededActiveResults[0]);
  }

  // 4. Build final canonical fallback names from all successful queries
  const allActive = [
    ...seededActiveResults,
    ...(Array.from(byProvider.values()).filter(Boolean) as MetadataResult[]),
  ];
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
      titles: [
        name,
        ...finalFallbackNames,
        ...(finalMatchContributions.titles ?? []),
      ],
      barcodes: [barcode, ...(finalMatchContributions.barcodes ?? [])],
      platformKey: finalMatchContributions.platformKey ?? resolvedPlatform,
      releaseDate: finalMatchContributions.releaseDate,
      externalIds: finalExternalIds,
    }),
  );

  // 5. Fallback Pass: retry missing search-capable providers using fallback
  // names. Gating (which providers to run) is decided once against the
  // post-stage-2 snapshot; the providers themselves are independent, so they run
  // concurrently and their results are applied in registry order to keep the
  // downstream merge deterministic regardless of completion order.
  const fallbackSnapshot = [
    ...seededActiveResults,
    ...(Array.from(byProvider.values()).filter(Boolean) as MetadataResult[]),
  ];
  const fallbackNeedsGallery = metadataResultsNeedGalleryEnrichment(
    type,
    fallbackSnapshot,
    cleanedBarcode,
  );
  const fallbackCapabilitiesIncomplete = metadataPassCapabilitiesIncomplete({
    type,
    activeResults: fallbackSnapshot,
    hasCapability: stage1HasMetadataCapability,
  });

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

      // Seed already complete — skip seeker fallbacks (gallery path above still runs).
      if (
        !fallbackCapabilitiesIncomplete &&
        !fallbackNeedsGallery &&
        providerInfo.auth.kind !== "scrape"
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
            providerId === CACHED_FICHE_MERGE_KEY ||
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
      if ((type === "games" || type === "hardware") && metadata.title?.trim()) {
        if (
          !isMetadataTitleAligned(metadata, alignmentNames, 0.58, {
            shelfType: type,
          }) ||
          isGenericTitleFragment(metadata.title, alignmentNames)
        ) {
          return [];
        }
      } else if (
        providerId !== CACHED_FICHE_MERGE_KEY &&
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
  shouldFetchMarketplaceListingInStage2,
  shouldResolveProviderForGallery,
  shouldSkipMetadataFallbackProvider,
  shouldSkipRateLimitedStageOneFallback,
  shouldSkipRedundantBookScrapeRound,
  shouldSkipRedundantGameScrapeRound,
  stage1HasMetadataCapability,
  supplementGameEditionProviderResults,
} from "@/core/enrich/metadataFetchGating";
import {
  mergeMetadata,
  preferRequestedDisplayTitle,
} from "@/core/enrich/merge";

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
} from "@/core/enrich/metadataFetchGating";
export {
  mergeMetadata,
  preferRequestedDisplayTitle,
  pickBestMetadataTitle,
  pickBestMetadataFactsFromObservations,
  orderResultsByObservationStrength,
  pickBestMetadataObservationTitle,
  pickBestMetadataObservationImageUrl,
  type ProviderMetadataInput,
} from "@/core/enrich/merge";
export { preferredMetadataLanguagesFromShelfName } from "@/core/enrich/shelfContentLocale";
export { buildBookMetadataSearchQueries } from "@/core/enrich/bookSearch";
export {
  supplementBookSearchAliases,
  withBookSearchAliases,
} from "@/core/enrich/bookSearchAliases";
