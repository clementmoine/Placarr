import { PROVIDER_MODULES, PROVIDERS } from "@/core/catalog/catalog";
import { canonicalProviderIdForSource } from "@/core/catalog/sourceTraits";
import type { Capability, MediaType } from "@/types/providerRegistry";
import type { MetadataResult } from "@/types/metadataProvider";

/** Core fields we expect before skipping scrape providers. */
const USEFUL_METADATA_CAPABILITIES: Record<MediaType, Capability[]> = {
  books: ["identify", "cover", "description"],
  games: ["identify", "cover", "description"],
  boardgames: ["identify", "cover", "description"],
  movies: ["identify", "cover", "description"],
  musics: ["identify", "cover"],
  hardware: ["identify", "cover"],
  tcg: ["identify", "cover"],
  toys: ["identify", "cover"],
};

export type MetadataCapabilityProbe = (
  results: Array<MetadataResult | null | undefined>,
  capability: Capability,
) => boolean;

/**
 * Provider ids already attached to the fiche (facts / evidence / attachments)
 * whose registry auth is scrape — refresh should re-query them.
 */
export function scrapeProviderIdsFromStoredSources(input: {
  facts?: Array<{ source?: string | null }> | null;
  fieldEvidence?: Array<{ source?: string | null }> | null;
  attachments?: Array<{ source?: string | null }> | null;
}): string[] {
  return ficheProviderIdsFromStoredSources(input, "scrape");
}

/**
 * Non-scrape (API / static) providers already on the fiche — refresh should
 * re-query them even when Tier 0+1 capabilities look "complete" (e.g. LorcanaJSON
 * after a multi-lang aliases gap-fill).
 */
export function nonScrapeProviderIdsFromStoredSources(input: {
  facts?: Array<{ source?: string | null }> | null;
  fieldEvidence?: Array<{ source?: string | null }> | null;
  attachments?: Array<{ source?: string | null }> | null;
}): string[] {
  return ficheProviderIdsFromStoredSources(input, "non-scrape");
}

function ficheProviderIdsFromStoredSources(
  input: {
    facts?: Array<{ source?: string | null }> | null;
    fieldEvidence?: Array<{ source?: string | null }> | null;
    attachments?: Array<{ source?: string | null }> | null;
  },
  kind: "scrape" | "non-scrape",
): string[] {
  const ids = new Set<string>();
  const consider = (source?: string | null) => {
    const id = canonicalProviderIdForSource(source);
    if (!id) return;
    const provider = PROVIDERS.find((entry) => entry.id === id);
    if (!provider) return;
    const isScrape = provider.auth.kind === "scrape";
    if (kind === "scrape" ? isScrape : !isScrape) ids.add(provider.id);
  };

  for (const fact of input.facts ?? []) consider(fact.source);
  for (const evidence of input.fieldEvidence ?? []) consider(evidence.source);
  for (const attachment of input.attachments ?? []) consider(attachment.source);

  return [...ids];
}

/**
 * Rebuild provider record ids from stored fiche URLs / attachment sources so
 * adapters can refresh by id instead of re-seeking title/barcode.
 */
export function externalIdsFromStoredSources(input: {
  facts?: Array<{
    source?: string | null;
    url?: string | null;
    kind?: string | null;
    value?: string | null;
  }> | null;
  fieldEvidence?: Array<{
    source?: string | null;
    sourceUrl?: string | null;
  }> | null;
}): Record<string, string> {
  const ids: Record<string, string> = {};

  const considerUrl = (url?: string | null, sourceHint?: string | null) => {
    if (!url?.trim()) return;
    const hintId = canonicalProviderIdForSource(sourceHint);
    for (const providerModule of PROVIDER_MODULES) {
      if (!providerModule.parseMetadataRecordIdFromUrl) continue;
      if (hintId && providerModule.info.id !== hintId) continue;
      const recordId = providerModule.parseMetadataRecordIdFromUrl(url.trim());
      if (recordId) {
        ids[providerModule.info.id] = recordId;
        return;
      }
    }
    // No source hint: try every parser (host-scoped inside each module).
    if (hintId) return;
    for (const providerModule of PROVIDER_MODULES) {
      if (!providerModule.parseMetadataRecordIdFromUrl) continue;
      const recordId = providerModule.parseMetadataRecordIdFromUrl(url.trim());
      if (recordId) {
        ids[providerModule.info.id] = recordId;
        return;
      }
    }
  };

  for (const fact of input.facts ?? []) {
    considerUrl(fact.url, fact.source);
  }
  for (const evidence of input.fieldEvidence ?? []) {
    considerUrl(evidence.sourceUrl, evidence.source);
  }

  return ids;
}

/**
 * Stable reorder: providers with a memorized fiche pin first, then seekers.
 * Used so concurrent scrape batches start pinned refreshes before blind search.
 */
export function preferPinnedProviderIds(
  providerIds: string[],
  pinnedIds: Iterable<string>,
): string[] {
  const pinned = new Set(pinnedIds);
  return [
    ...providerIds.filter((id) => pinned.has(id)),
    ...providerIds.filter((id) => !pinned.has(id)),
  ];
}

/**
 * Absolute fiche URLs already attached to the item, keyed by provider id.
 * Prefer these for refresh so adapters can skip title/barcode seek.
 */
export function providerRecordUrlsFromStoredSources(input: {
  facts?: Array<{
    source?: string | null;
    url?: string | null;
    kind?: string | null;
  }> | null;
  fieldEvidence?: Array<{
    source?: string | null;
    sourceUrl?: string | null;
  }> | null;
}): Record<string, string> {
  const urls: Record<string, string> = {};

  const consider = (url?: string | null, sourceHint?: string | null) => {
    if (!url?.trim()) return;
    const trimmed = url.trim();
    const hintId = canonicalProviderIdForSource(sourceHint);

    const tryParse = (providerModule: (typeof PROVIDER_MODULES)[number]) => {
      if (!providerModule.parseMetadataRecordIdFromUrl) return false;
      if (!providerModule.parseMetadataRecordIdFromUrl(trimmed)) return false;
      urls[providerModule.info.id] = trimmed;
      return true;
    };

    if (hintId) {
      const hinted = PROVIDER_MODULES.find(
        (providerModule) => providerModule.info.id === hintId,
      );
      if (hinted && tryParse(hinted)) return;
      const provider = PROVIDERS.find((entry) => entry.id === hintId);
      if (provider && !urls[hintId]) {
        try {
          const host = new URL(trimmed).hostname.replace(/^www\./i, "");
          const website = provider.websiteUrl
            ? new URL(provider.websiteUrl).hostname.replace(/^www\./i, "")
            : null;
          if (website && (host === website || host.endsWith(`.${website}`))) {
            urls[hintId] = trimmed;
          }
        } catch {
          /* ignore bad URLs */
        }
      }
      return;
    }

    for (const providerModule of PROVIDER_MODULES) {
      if (tryParse(providerModule)) return;
    }
  };

  for (const fact of input.facts ?? []) {
    if (
      fact.kind &&
      fact.kind !== "external-link" &&
      fact.kind !== "source-url"
    ) {
      continue;
    }
    consider(fact.url, fact.source);
  }
  for (const evidence of input.fieldEvidence ?? []) {
    consider(evidence.sourceUrl, evidence.source);
  }

  return urls;
}

/** True when a primary FR/catalog book cover (not Google Books / OpenLibrary) is present. */
export function metadataResultsHavePrimaryBookCover(
  results: Array<MetadataResult | null | undefined>,
): boolean {
  for (const result of results) {
    if (!result) continue;
    for (const attachment of result.attachments ?? []) {
      if (
        attachment.type !== "cover" &&
        attachment.type !== "image" &&
        attachment.type !== "artwork"
      ) {
        continue;
      }
      const id = canonicalProviderIdForSource(attachment.source);
      if (!id) continue;
      const provider = PROVIDERS.find((entry) => entry.id === id);
      if (
        provider?.bookCoverPriority === "primary" ||
        provider?.bookGallerySource
      ) {
        return true;
      }
    }
    if (result.imageUrl) {
      for (const provider of PROVIDERS) {
        if (
          provider.bookCoverPriority !== "primary" &&
          !provider.bookGallerySource
        ) {
          continue;
        }
        if (
          provider.coverUrlHost &&
          result.imageUrl.includes(provider.coverUrlHost)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

export function metadataPassCapabilitiesIncomplete(options: {
  type: MediaType;
  activeResults: MetadataResult[];
  hasCapability: MetadataCapabilityProbe;
}): boolean {
  const required = USEFUL_METADATA_CAPABILITIES[options.type] ?? [
    "identify",
    "cover",
  ];

  for (const capability of required) {
    if (capability === "cover" && options.type === "books") {
      if (!metadataResultsHavePrimaryBookCover(options.activeResults)) {
        return true;
      }
      continue;
    }
    if (!options.hasCapability(options.activeResults, capability)) {
      return true;
    }
  }

  return false;
}

/**
 * Non-scrape (Tier 0+1 API/local) provider ids to resolve.
 *
 * - Capability gaps → full candidate set.
 * - Already complete from seed/prior results → **only** fiche-pinned non-scrape
 *   ids ∩ candidates (refresh known API pins; never re-swarm IGDB/SS/…).
 */
export function apiProvidersForMetadataPass(options: {
  type: MediaType;
  activeResults: MetadataResult[];
  candidateApiProviderIds: readonly string[];
  pinnedNonScrapeProviderIds?: readonly string[];
  hasCapability: MetadataCapabilityProbe;
}): string[] {
  const candidates = options.candidateApiProviderIds;
  if (candidates.length === 0) return [];

  if (metadataPassCapabilitiesIncomplete(options)) {
    return [...candidates];
  }

  const pinned = new Set(options.pinnedNonScrapeProviderIds ?? []);
  if (pinned.size === 0) return [];

  return candidates.filter((id) => pinned.has(id));
}

/**
 * Scrape provider ids to resolve after the API/local (Tier 0+1) pass.
 *
 * - Capability gaps → full candidate set (seek + fill).
 * - Tier 0+1 already complete → **only** fiche-pinned scrapes ∩ candidates
 *   (refresh known URLs; never wake the Flare seeker swarm).
 *
 * For books, a Google Books / OpenLibrary cover alone does **not** satisfy
 * "cover" — primary catalog scrapes (Bedetheque, BDovore, …) stay candidates.
 */
export function scrapeProvidersForMetadataPass(options: {
  type: MediaType;
  activeResults: MetadataResult[];
  existingScrapeProviderIds?: readonly string[];
  candidateScrapeProviderIds: readonly string[];
  hasCapability: MetadataCapabilityProbe;
  /** Stored fiche already complete (see `isLightRefreshEligible`). */
  lightRefresh?: boolean;
}): string[] {
  const candidates = options.candidateScrapeProviderIds;
  if (candidates.length === 0) return [];

  if (metadataPassCapabilitiesIncomplete(options)) {
    return [...candidates];
  }

  // Nothing left to seek and nothing stale — not even the pinned fiches are
  // worth a round-trip on this pass.
  if (options.lightRefresh) return [];

  const pinned = new Set(options.existingScrapeProviderIds ?? []);
  if (pinned.size === 0) return [];

  return candidates.filter((id) => pinned.has(id));
}

/**
 * After the API/DB pass: scrape only for capability gaps, or to refresh
 * scrape providers already cited on the fiche (pinned — not the full swarm).
 */
export function shouldRunScrapeMetadataPass(options: {
  type: MediaType;
  activeResults: MetadataResult[];
  existingScrapeProviderIds?: readonly string[];
  candidateScrapeProviderIds: readonly string[];
  hasCapability: MetadataCapabilityProbe;
  lightRefresh?: boolean;
}): boolean {
  return scrapeProvidersForMetadataPass(options).length > 0;
}
