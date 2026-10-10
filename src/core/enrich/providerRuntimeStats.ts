import { PROVIDERS } from "@/core/catalog/catalog";
import { canonicalProviderIdForSource } from "@/core/catalog/sourceTraits";
import type { MediaType } from "@/types/providerRegistry";
import type { MetadataResult } from "@/types/metadataProvider";

const EMA_ALPHA = 0.3;
/** Below this, ordering leans on registry traits (cold start). */
export const PROVIDER_STATS_COLD_START_SAMPLES = 5;

export type ProviderRuntimeStat = {
  resolveCount: number;
  hitCount: number;
  coverWinCount: number;
  fieldContributeCount: number;
  latencyEmaMs: number;
};

type StatKey = string;

const statsByKey = new Map<StatKey, ProviderRuntimeStat>();

function statKey(providerId: string, mediaType?: MediaType | null): StatKey {
  return mediaType ? `${mediaType}::${providerId}` : providerId;
}

function emptyStat(): ProviderRuntimeStat {
  return {
    resolveCount: 0,
    hitCount: 0,
    coverWinCount: 0,
    fieldContributeCount: 0,
    latencyEmaMs: 0,
  };
}

function getOrCreate(
  providerId: string,
  mediaType?: MediaType | null,
): ProviderRuntimeStat {
  const key = statKey(providerId, mediaType);
  const existing = statsByKey.get(key);
  if (existing) return existing;
  const created = emptyStat();
  statsByKey.set(key, created);
  return created;
}

export function getProviderRuntimeStat(
  providerId: string,
  mediaType?: MediaType | null,
): ProviderRuntimeStat | null {
  return statsByKey.get(statKey(providerId, mediaType)) ?? null;
}

export function resetProviderRuntimeStatsForTests(): void {
  statsByKey.clear();
}

export function recordProviderResolve(input: {
  providerId: string;
  mediaType?: MediaType | null;
  durationMs: number;
  hit: boolean;
}): void {
  const durationMs = Math.max(0, input.durationMs);
  const stat = getOrCreate(input.providerId, input.mediaType);
  stat.resolveCount += 1;
  if (input.hit) stat.hitCount += 1;
  stat.latencyEmaMs =
    stat.resolveCount === 1
      ? durationMs
      : EMA_ALPHA * durationMs + (1 - EMA_ALPHA) * stat.latencyEmaMs;
}

export function recordProviderContribution(input: {
  providerId: string;
  mediaType?: MediaType | null;
  kind: "cover" | "field";
}): void {
  const stat = getOrCreate(input.providerId, input.mediaType);
  if (input.kind === "cover") {
    stat.coverWinCount += 1;
  } else {
    stat.fieldContributeCount += 1;
  }
}

/**
 * Attribute a retained cover (and optional field presence) to the provider
 * that sourced it — used after progressive / final merges.
 */
export function recordContributionsFromMergedMetadata(
  result: MetadataResult | null | undefined,
  mediaType?: MediaType | null,
): void {
  if (!result) return;

  const coverAttachment =
    result.attachments?.find(
      (attachment) =>
        attachment.url && result.imageUrl && attachment.url === result.imageUrl,
    ) ??
    result.attachments?.find(
      (attachment) =>
        attachment.type === "cover" ||
        attachment.type === "image" ||
        attachment.type === "artwork",
    );

  const coverSource =
    coverAttachment?.source ??
    (result.imageUrl
      ? PROVIDERS.find(
          (provider) =>
            provider.coverUrlHost &&
            result.imageUrl!.includes(provider.coverUrlHost),
        )?.id
      : undefined);

  const coverProviderId = coverSource
    ? (canonicalProviderIdForSource(coverSource) ?? coverSource)
    : null;
  if (coverProviderId && result.imageUrl) {
    recordProviderContribution({
      providerId: coverProviderId,
      mediaType,
      kind: "cover",
    });
  }

  if (result.title?.trim() || result.description?.trim()) {
    const fieldSources = new Set<string>();
    for (const fact of result.facts ?? []) {
      const id = canonicalProviderIdForSource(fact.source);
      if (id) fieldSources.add(id);
    }
    for (const attachment of result.attachments ?? []) {
      const id = canonicalProviderIdForSource(attachment.source);
      if (id) fieldSources.add(id);
    }
    if (coverProviderId) fieldSources.add(coverProviderId);
    for (const providerId of fieldSources) {
      recordProviderContribution({
        providerId,
        mediaType,
        kind: "field",
      });
    }
  }
}

function traitBootstrapScore(providerId: string): number {
  const provider = PROVIDERS.find((entry) => entry.id === providerId);
  if (!provider) return 0;

  let score = 0;
  if (
    provider.bookCoverPriority === "primary" ||
    provider.bookGallerySource ||
    provider.canonicalCover ||
    provider.isRealBoxCover ||
    provider.gameMediaGallerySource
  ) {
    score += 30;
  }
  if (provider.bookCoverPriority === "secondary") score -= 5;
  if (provider.slowScanScrape) score -= 20;
  if (provider.isSecondary) score -= 15;
  if (provider.rateLimited) score -= 10;
  return score;
}

/**
 * Higher score → resolve earlier. Combines registry traits (cold start) with
 * measured latency / hit / cover-win rates once enough samples exist.
 */
export function providerResolvePriorityScore(
  providerId: string,
  mediaType?: MediaType | null,
): number {
  const traitScore = traitBootstrapScore(providerId);
  const stat = getProviderRuntimeStat(providerId, mediaType);
  if (!stat || stat.resolveCount < PROVIDER_STATS_COLD_START_SAMPLES) {
    return traitScore;
  }

  const hitRate = stat.hitCount / Math.max(1, stat.resolveCount);
  const coverWinRate = stat.coverWinCount / Math.max(1, stat.resolveCount);
  const latencyPenalty = Math.min(stat.latencyEmaMs / 1000, 30);

  return traitScore + hitRate * 40 + coverWinRate * 50 - latencyPenalty;
}

/**
 * Stable reorder: optional pinned ids stay first (fiche refresh), then
 * remaining ids by {@link providerResolvePriorityScore} (desc). Never drops ids.
 */
export function orderProviderIdsForResolve(
  providerIds: readonly string[],
  options?: {
    mediaType?: MediaType | null;
    pinnedIds?: Iterable<string>;
  },
): string[] {
  if (providerIds.length <= 1) return [...providerIds];

  const pinned = new Set(options?.pinnedIds ?? []);
  const mediaType = options?.mediaType;
  const indexById = new Map(providerIds.map((id, index) => [id, index]));

  const compare = (a: string, b: string): number => {
    const scoreDiff =
      providerResolvePriorityScore(b, mediaType) -
      providerResolvePriorityScore(a, mediaType);
    if (scoreDiff !== 0) return scoreDiff;
    return (indexById.get(a) ?? 0) - (indexById.get(b) ?? 0);
  };

  const head = providerIds.filter((id) => pinned.has(id));
  const tail = providerIds.filter((id) => !pinned.has(id)).sort(compare);
  // Keep pinned in their relative input order (preferPinned already ordered them).
  return [...head, ...tail];
}
