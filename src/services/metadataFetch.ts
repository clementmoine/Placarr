import type { MediaType } from "@/types/providerRegistry";
import {
  isMediaType,
  isPcLikeGamePlatform,
  metadataCandidatesForType,
} from "@/services/metadataProviderSelection";
import { resolveMetadataProvidersInOrder } from "@/lib/metadataProviderQueue";
import { metadataProviderResolverMap } from "@/services/metadataResolvers";
import { loadBarcodeAlternateNames } from "@/lib/barcodeAlternateNames";
import { cleanCode } from "@/lib/barcode/query";
import {
  buildGameMetadataFallbackNames,
  isMetadataTitleAligned,
  isGenericTitleFragment,
  shouldRecheckScreenScraperMatch,
  findBetterScreenScraperMatch,
} from "@/lib/metadataTitleMatching";
import { isScreenScraperQuotaBlocked } from "@/services/providers/screenscraper/cache";
import {
  areDisplayTitlesSameProduct,
  requestedTitleCoversCurrentTitle,
} from "@/lib/displayTitleScore";
import { mergeMetadata, preferRequestedDisplayTitle } from "@/services/metadataMerge";
import { dedupeFieldEvidence, metadataFieldEvidence } from "@/services/metadataFacts";
import type { MetadataResult } from "@/types/metadataProvider";
import type { Capability, ProviderInfo } from "@/types/providerRegistry";

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

export async function fetchMetadata(
  name: string,
  type: MediaType,
  barcode?: string | null,
  platform?: string | null,
  options?: { isBackground?: boolean },
): Promise<MetadataResult | null> {
  const providers = metadataCandidatesForType(type);
  const canonicalProviders = providers.filter((p) => !p.isSecondary);
  const secondaryProviders = providers.filter((p) => p.isSecondary);

  const byProvider = new Map<string, MetadataResult | null>();

  // 1. Stage 1: Resolve canonical providers concurrently
  if (canonicalProviders.length > 0) {
    const canonicalResults = await resolveMetadataProvidersInOrder(
      canonicalProviders.map((p) => p.id),
      { name, barcode, platform, isBackground: options?.isBackground },
      metadataProviderResolverMap,
    );
    for (const [id, res] of canonicalResults.entries()) {
      byProvider.set(id, res);
    }
  }

  // 2. Build accumulated context from Stage 1 results
  const cleanedBarcode = barcode ? cleanCode(barcode) : "";
  const barcodeAlternateNames = cleanedBarcode ? await loadBarcodeAlternateNames(cleanedBarcode) : [];
  const stage1Active = Array.from(byProvider.values()).filter(Boolean) as MetadataResult[];
  const stage1FallbackNames = buildGameMetadataFallbackNames(
    name,
    barcodeAlternateNames,
    stage1Active
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
    const hasStage1TitleAndCover = Array.from(byProvider.values()).some((res) => res?.title && res?.imageUrl);
    const hasStage1Duration = Array.from(byProvider.values()).some((res) => res?.facts?.some((f) => f.kind === "duration" || f.kind === "time-to-beat" || f.kind === "completion-time"));
    const hasStage1Price = Array.from(byProvider.values()).some((res) => res?.facts?.some((f) => f.kind === "price" || f.kind === "estimated-value" || f.kind === "observed-price"));

    const toResolve = secondaryProviders.filter((p) => {
      if (p.auth.kind === "scrape") {
        const caps = metadataCapabilitiesOf(p);
        if (caps.includes("duration") && !hasStage1Duration) return true;
        if (caps.includes("price") && !hasStage1Price) return true;
        if (hasStage1TitleAndCover) return false;
      }
      return true;
    });

    if (toResolve.length > 0) {
      const secondaryResults = await resolveMetadataProvidersInOrder(
        toResolve.map((p) => p.id),
        {
          name,
          barcode,
          platform,
          isBackground: options?.isBackground,
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

  const hasAnyResult = Array.from(byProvider.values()).some((res) => res !== null);
  if (!hasAnyResult) {
    return null;
  }

  // 4. Build final canonical fallback names from all successful queries
  const allActive = Array.from(byProvider.values()).filter(Boolean) as MetadataResult[];
  const finalFallbackNames = buildGameMetadataFallbackNames(
    name,
    barcodeAlternateNames,
    allActive
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
    const existing = byProvider.get(providerId);
    if (existing) continue;

    const providerInfo = providers.find((p) => p.id === providerId);
    if (!providerInfo?.capabilities.includes("identify")) continue;

    const hasTitleAndCover = Array.from(byProvider.values()).some((res) => res?.title && res?.imageUrl);
    const hasPrice = Array.from(byProvider.values()).some((res) => res?.facts?.some((f) => f.kind === "price" || f.kind === "estimated-value" || f.kind === "observed-price"));

    if (providerInfo?.auth.kind === "scrape") {
      const caps = metadataCapabilitiesOf(providerInfo);
      // Duration providers (HowLongToBeat) always run for games so their
      // playtimes are fetched and can be cross-checked against other sources —
      // notably the 100% completion that IGDB's game_time_to_beats often omits.
      // They are therefore never short-circuited by an existing time-to-beat.
      const skip =
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
          name: fallbackName,
          barcode,
          platform,
          isBackground: options?.isBackground,
          imdbId: finalImdbId,
          externalIds: finalExternalIds,
          fallbackNames: finalFallbackNames,
        }),
      {
        limit: providerId === "screenscraper" ? 6 : 12,
        validate: (candidate, fallbackName) =>
          isMetadataTitleAligned(
            candidate,
            [name, fallbackName, ...finalFallbackNames],
            0.58,
          ),
      },
    );

    if (resolved) {
      byProvider.set(providerId, resolved);
    }
  }

  // 5.1 screenscraper recheck match
  const ss = byProvider.get("screenscraper");
  if (
    ss &&
    !isScreenScraperQuotaBlocked() &&
    shouldRecheckScreenScraperMatch(name, ss, finalFallbackNames)
  ) {
    const improved = await findBetterScreenScraperMatch(
      name,
      ss,
      finalFallbackNames,
      barcode,
      platform,
    );
    if (improved) {
      byProvider.set("screenscraper", improved);
    }
  }

  // 6. Merge results generically
  const mergeInputs = Array.from(byProvider.entries()).flatMap(([providerId, metadata]) => {
    if (!metadata) return [];
    if (type === "games" && ["igdb", "thegamesdb", "launchbox", "rawg"].includes(providerId)) {
      const alignmentNames = [name, ...barcodeAlternateNames].filter(Boolean);
      if (
        !isMetadataTitleAligned(metadata, alignmentNames, 0.58) ||
        isGenericTitleFragment(metadata.title, alignmentNames)
      ) {
        return [];
      }
    }
    return [{ providerId, metadata }];
  });

  const merged = mergeMetadata(type, mergeInputs, {
    includePcSources: isPcLikeGamePlatform(platform),
  });

  let finalMerged = merged;
  if (type === "games") {
    const pcResult = mergeInputs.find((r) => r.providerId === "pricecharting")?.metadata;
    const pcTitle = pcResult?.title;
    const alignmentNames = [name, ...barcodeAlternateNames].filter(Boolean);
    if (pcTitle && isMetadataTitleAligned({ title: pcTitle }, alignmentNames, 0.58)) {
      if (!merged.title?.trim()) {
        finalMerged = { ...merged, title: pcTitle };
      } else if (!isMetadataTitleAligned(merged, alignmentNames, 0.58)) {
        const aliases = Array.from(
          new Set([merged.title, ...(merged.aliases || [])]),
        ).filter(
          (alias) => alias.toLowerCase().trim() !== pcTitle.toLowerCase().trim(),
        );
        finalMerged = {
          ...merged,
          title: pcTitle,
          aliases: aliases.length > 0 ? aliases : undefined,
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
    })
  );

  // PriceCharting age rating evidence fallback
  const pcResult = mergeInputs.find((r) => r.providerId === "pricecharting")?.metadata;
  const pcTitleEvidence =
    pcResult?.title && finalMerged.title === pcResult.title
      ? metadataFieldEvidence("PriceCharting", { title: pcResult.title })
      : [];

  const mergedWithEvidence: MetadataResult = {
    ...finalMerged,
    fieldEvidence: dedupeFieldEvidence([
      ...fieldEvidence,
      ...pcTitleEvidence,
      ...metadataFieldEvidence("MergedEngine", finalMerged, {
        confidence: 0.8,
        priority: 200,
      }),
    ]),
  };

  // PriceCharting custom display title fallback logic
  const pcResultForTitle = mergeInputs.find((r) => r.providerId === "pricecharting")?.metadata;
  const pcTitleForTitle = pcResultForTitle?.title;
  if (
    pcTitleForTitle &&
    finalMerged.title === pcTitleForTitle &&
    areDisplayTitlesSameProduct(pcTitleForTitle, name) &&
    !requestedTitleCoversCurrentTitle(name, pcTitleForTitle)
  ) {
    const requestedTitle = name.trim();
    const aliases = Array.from(
      new Set([requestedTitle, ...(mergedWithEvidence.aliases || [])]),
    ).filter(
      (alias) =>
        alias.toLowerCase().trim() !== pcTitleForTitle.toLowerCase().trim(),
    );
    return {
      ...mergedWithEvidence,
      aliases: aliases.length > 0 ? aliases : undefined,
    };
  }

  return preferRequestedDisplayTitle(mergedWithEvidence, name);
}

export async function fetchMetadataByType(
  name: string,
  type: string,
  barcode?: string | null,
  platform?: string | null,
  options?: { isBackground?: boolean },
): Promise<MetadataResult | null> {
  if (!isMediaType(type)) return null;
  return fetchMetadata(name, type, barcode, platform, options);
}
