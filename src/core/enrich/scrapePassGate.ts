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
  const ids = new Set<string>();
  const consider = (source?: string | null) => {
    const id = canonicalProviderIdForSource(source);
    if (!id) return;
    const provider = PROVIDERS.find((entry) => entry.id === id);
    if (provider?.auth.kind === "scrape") ids.add(provider.id);
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
    for (const module of PROVIDER_MODULES) {
      if (!module.parseMetadataRecordIdFromUrl) continue;
      if (hintId && module.info.id !== hintId) continue;
      const recordId = module.parseMetadataRecordIdFromUrl(url.trim());
      if (recordId) {
        ids[module.info.id] = recordId;
        return;
      }
    }
    // No source hint: try every parser (host-scoped inside each module).
    if (hintId) return;
    for (const module of PROVIDER_MODULES) {
      if (!module.parseMetadataRecordIdFromUrl) continue;
      const recordId = module.parseMetadataRecordIdFromUrl(url.trim());
      if (recordId) {
        ids[module.info.id] = recordId;
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

    const tryParse = (module: (typeof PROVIDER_MODULES)[number]) => {
      if (!module.parseMetadataRecordIdFromUrl) return false;
      if (!module.parseMetadataRecordIdFromUrl(trimmed)) return false;
      urls[module.info.id] = trimmed;
      return true;
    };

    if (hintId) {
      const hinted = PROVIDER_MODULES.find(
        (module) => module.info.id === hintId,
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

    for (const module of PROVIDER_MODULES) {
      if (tryParse(module)) return;
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

/**
 * After the API/DB pass: scrape only when useful fields are missing, or when
 * the fiche already cites a scrape provider we should refresh.
 *
 * For books, a Google Books / OpenLibrary cover alone does **not** satisfy
 * "cover" — we still want primary catalog scrapes (Bedetheque, BDovore, …).
 */
export function shouldRunScrapeMetadataPass(options: {
  type: MediaType;
  activeResults: MetadataResult[];
  existingScrapeProviderIds?: readonly string[];
  candidateScrapeProviderIds: readonly string[];
  hasCapability: MetadataCapabilityProbe;
}): boolean {
  const candidates = new Set(options.candidateScrapeProviderIds);
  if (options.existingScrapeProviderIds?.some((id) => candidates.has(id))) {
    return true;
  }

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
