/**
 * Gating + shaping helpers for the metadata fetch orchestrator.
 */
import type {
  MediaType,
  Capability,
  ProviderInfo,
} from "@/types/providerRegistry";
import { isMetadataProviderQuotaBlocked } from "@/core/enrich/selection";
import { runWithConcurrency } from "@/lib/async/runWithConcurrency";
import { metadataProviderResolverMap } from "@/core/catalog/bootstrap";
import type {
  MetadataAdapterContext,
  MetadataProviderAdapter,
} from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";
import {
  buildMetadataAlignmentNames,
  extractBaseTitleVariant,
  isMetadataTitleAligned,
  isGenericTitleFragment,
  supplementGameEditionMetadata,
} from "@/core/enrich/titleMatching";
import {
  isVideoGamePlatformKey,
  detectVideoGamePlatformKey,
  videoGamePlatformTargetsPhysicalMedia,
} from "@/core/identify/platforms/platforms";
import { detectShelfGamePlatformKey } from "@/core/enrich/platform";
import { cleanCode, detectPlatformKey } from "@/core/identify/query";
import { throwIfAborted, isAbortError } from "@/lib/http/abort";
import {
  normalizeProductBarcode,
  pickDiscoveredBarcode,
} from "@/core/identify/normalize";
import { bookIsbnBootstrapProviderIds } from "@/core/catalog/catalog";
import {
  metadataResultsNeedGalleryEnrichment,
  metadataResultsHaveGameGallerySource,
} from "@/core/enrich/galleryEnrichment";
import { metadataHasDisplayImage } from "@/core/enrich/displayImage";

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
export const METADATA_RESOLVE_CONCURRENCY = 5;

function metadataHasDescription(metadata: MetadataResult): boolean {
  return Boolean(metadata.description?.trim());
}

/** Provider already pinned a record — title recheck / fallback names won't help. */
export function metadataResultIsPinnedForRecheck(result: MetadataResult): boolean {
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
export function metadataFallbackQueryLimit(
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
export function shouldSkipRateLimitedStageOneFallback(
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

export function stage1HasMetadataCapability(
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

export function metadataHasBarcode(metadata: MetadataResult): boolean {
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

export async function bootstrapBookProvidersWithDiscoveredIsbn(
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

export function normalizeMetadataPlatformKey(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (isVideoGamePlatformKey(trimmed)) return trimmed;
  return detectPlatformKey(trimmed);
}

export function isMetadataPlatformCompatible(
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
export function consoleShelfRejectsWebOnlyGameMetadata(
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
export function metadataCapabilitiesOf(provider: ProviderInfo): Capability[] {
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
export function shouldFetchMarketplaceListingInStage2(
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

export function shouldFetchGameGallerySourceInStage2(
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

export function shouldSkipRedundantGameScrapeRound(
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
export function shouldSkipRedundantBookScrapeRound(
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
export function shouldSkipMetadataFallbackProvider(
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

export function shouldResolveProviderForGallery(
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

export function mergeInputWithTrait(
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

export async function resolveWithFallbackNames(
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

export async function supplementGameEditionProviderResults(
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

export function metadataAlignmentNames(
  name: string,
  barcodeAlternateNames: string[],
): string[] {
  return buildMetadataAlignmentNames(name, barcodeAlternateNames);
}

export function alignedProviderResultsForFallback(
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

export function metadataProvidersReadyToResolve(providerIds: string[]): string[] {
  return providerIds.filter((id) => !isMetadataProviderQuotaBlocked(id));
}
