import type { MediaType } from "@/types/providerRegistry";
import {
  isMediaType,
  isPcLikeGamePlatform,
  metadataCandidatesForType,
} from "@/services/metadata/selection";
import { resolveMetadataProvidersInOrder } from "@/lib/metadata/providerQueue";
import { metadataProviderResolverMap } from "@/services/provider/bootstrap";
import { loadBarcodeAlternateNames } from "@/lib/barcode/alternateNames";
import { pickDiscoveredBarcode } from "@/lib/barcode/normalize";
import { cleanCode, detectPlatformKey } from "@/lib/barcode/query";
import { isVideoGamePlatformKey } from "@/lib/games/platforms";
import {
  buildGameMetadataFallbackNames,
  buildRequestedTitleFallbackVariants,
  extractBaseTitleVariant,
  buildGameMetadataSearchQueries,
  isMetadataTitleAligned,
  isGenericTitleFragment,
  supplementGameEditionMetadata,
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
  metadataFieldEvidence,
} from "@/services/metadata/facts";
import type { MetadataResult } from "@/types/metadataProvider";
import type { Capability, ProviderInfo } from "@/types/providerRegistry";
import type {
  MetadataAdapterContext,
  MetadataProviderAdapter,
} from "@/types/providerModule";
import { bookIsbnBootstrapProviderIds } from "@/services/provider/registry";
import { buildBoardGameMetadataSearchQueries } from "@/lib/metadata/boardGame";
import { buildBookMetadataSearchQueries } from "@/lib/metadata/bookSearch";
import { buildPriceSearchQueries } from "@/lib/pricing/searchQueries";
import { preferredMetadataLanguagesFromShelfName } from "@/lib/metadata/shelfContentLocale";
import { resolveGameMetadataPlatform } from "@/lib/metadata/platform";
import { inferTextLanguage } from "@/lib/locale/preference";
import { throwIfAborted, isAbortError } from "@/lib/http/abort";

import { metadataHasDisplayImage } from "@/lib/metadata/displayImage";

function metadataHasDescription(metadata: MetadataResult): boolean {
  return Boolean(metadata.description?.trim());
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
        return (
          typeof result.duration === "number" &&
          result.duration > 0
        );
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
): boolean {
  if (type !== "games") return true;
  const requestedPlatformKey = normalizeMetadataPlatformKey(platform);
  const resultPlatformKey = normalizeMetadataPlatformKey(metadata.platformKey);
  if (!requestedPlatformKey || !resultPlatformKey) return true;
  return requestedPlatformKey === resultPlatformKey;
}

function isLivingRoomConsolePlatformKey(key: string | null): boolean {
  if (!key || !isVideoGamePlatformKey(key)) return false;
  return key !== "pc" && key !== ("web" as typeof key);
}

/** Drops web-only catalog hits when the shelf targets a console release. */
function consoleShelfRejectsWebOnlyGameMetadata(
  metadata: MetadataResult,
  requestedPlatformKey: string | null,
): boolean {
  if (!isLivingRoomConsolePlatformKey(requestedPlatformKey)) return false;
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
    (provider.isRealBoxCover &&
      provider.capabilities.includes("cover") &&
      provider.isSecondary),
  );
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
  } = {},
): Promise<void> {
  const baseTitle = extractBaseTitleVariant(requestedName);
  if (!baseTitle) return;

  const alignmentNames = [requestedName, baseTitle];

  for (const providerInfo of providers) {
    if (!providerInfo.capabilities.includes("identify")) continue;
    if (isMetadataProviderQuotaBlocked(providerInfo.id)) continue;

    const providerId = providerInfo.id;
    const adapter = metadataProviderResolverMap.get(providerId);
    if (!adapter) continue;

    throwIfAborted(context.signal);

    const editionMetadata = byProvider.get(providerId) ?? null;
    if (
      editionMetadata &&
      !isMetadataTitleAligned(editionMetadata, alignmentNames, 0.58)
    ) {
      continue;
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
      continue;
    }

    if (
      !baseResult ||
      !isMetadataTitleAligned(baseResult, alignmentNames, 0.58)
    ) {
      continue;
    }

    const editionStub: MetadataResult =
      editionMetadata ?? { title: requestedName.trim() };

    byProvider.set(
      providerId,
      supplementGameEditionMetadata(requestedName, editionStub, baseResult),
    );
  }
}

function metadataAlignmentNames(
  name: string,
  barcodeAlternateNames: string[],
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const candidate of [
    name,
    ...buildRequestedTitleFallbackVariants(name),
    extractBaseTitleVariant(name),
    ...barcodeAlternateNames,
  ]) {
    const value = candidate?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(value);
  }
  return ordered;
}

function alignedProviderResultsForFallback(
  byProvider: Map<string, MetadataResult | null>,
  providers: ProviderInfo[],
  alignmentNames: string[],
): MetadataResult[] {
  return Array.from(byProvider.entries()).flatMap(([providerId, metadata]) => {
    if (!metadata) return [];
    const providerInfo = providers.find((provider) => provider.id === providerId);
    if (
      providerInfo?.requiresTitleAlignment &&
      (!isMetadataTitleAligned(metadata, alignmentNames, 0.58) ||
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

export async function fetchMetadata(
  name: string,
  type: MediaType,
  barcode?: string | null,
  platform?: string | null,
  options?: { isBackground?: boolean; shelfName?: string | null; signal?: AbortSignal },
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

    const toResolve = secondaryProviders.filter((p) => {
      if (isMetadataProviderQuotaBlocked(p.id)) return false;
      if (shouldAlwaysFetchGameGallerySource(p)) return true;
      if (p.auth.kind !== "scrape") return true;
      const caps = metadataCapabilitiesOf(p);
      return caps.some((cap) => !stage1HasMetadataCapability(stage1Results, cap));
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

  // 5. Fallback Pass: retry missing search-capable providers using fallback names
  for (const providerId of providers.map((p) => p.id)) {
    throwIfAborted(options?.signal);
    const existing = byProvider.get(providerId);
    if (existing) continue;

    const providerInfo = providers.find((p) => p.id === providerId);
    if (!providerInfo?.capabilities.includes("identify")) continue;
    if (isMetadataProviderQuotaBlocked(providerId)) continue;

    const hasTitleAndCover = Array.from(byProvider.values()).some(
      (res) => res?.title && res?.imageUrl,
    );
    const hasPrice = Array.from(byProvider.values()).some((res) =>
      res?.facts?.some(
        (f) =>
          f.kind === "price" ||
          f.kind === "estimated-value" ||
          f.kind === "observed-price",
      ),
    );

    if (providerInfo?.auth.kind === "scrape") {
      const caps = metadataCapabilitiesOf(providerInfo);
      // Duration providers (HowLongToBeat) always run for games so their
      // playtimes are fetched and can be cross-checked against other sources —
      // notably the 100% completion that IGDB's game_time_to_beats often omits.
      // They are therefore never short-circuited by an existing time-to-beat.
      const skip =
        !shouldAlwaysFetchGameGallerySource(providerInfo) &&
        hasTitleAndCover &&
        !caps.includes("duration") &&
        (!caps.includes("price") || hasPrice);
      if (skip) continue;
    }

    const adapter = metadataProviderResolverMap.get(providerId);
    if (!adapter) continue;

    // adapter.resolve already routes through the per-provider queue
    // (wrapMetadataProviderAdapter). Do NOT wrap it again in
    // runQueuedMetadataProviderCall: on a concurrency-1 provider queue the
    // outer task would hold the only slot while awaiting the inner task,
    // which can never start — a re-entrant deadlock that hangs the request.
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
        limit: providerInfo?.rateLimited ? 6 : 12,
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

    if (resolved) {
      byProvider.set(providerId, resolved);
    }
  }

  for (const providerInfo of providers.filter((p) => p.metadataMatchRecheck)) {
    const current = byProvider.get(providerInfo.id);
    if (
      !current ||
      isMetadataProviderQuotaBlocked(providerInfo.id) ||
      !shouldRecheckMetadataMatch(name, current, finalFallbackNames)
    ) {
      continue;
    }
    const adapter = metadataProviderResolverMap.get(providerInfo.id);
    if (!adapter) continue;
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
    if (improved) {
      byProvider.set(providerInfo.id, improved);
    }
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
      } else if (providers.find((p) => p.id === providerId)?.requiresTitleAlignment) {
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

  const mergedWithEvidence: MetadataResult = {
    ...finalMerged,
    fieldEvidence: dedupeFieldEvidence([
      ...fieldEvidence,
      ...catalogTitleEvidence,
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
    signal?: AbortSignal;
  },
): Promise<MetadataResult | null> {
  if (!isMediaType(type)) return null;
  return fetchMetadata(name, type, barcode, platform, options);
}
