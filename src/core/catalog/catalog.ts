/**
 * Provider catalog — generic discovery and queries over the manifest (`registry.ts`).
 * Core code imports from here, not from the manifest.
 */
import type {
  InferredImageAttachmentSemantics,
  ProviderModule,
  ProviderProductUrlRef,
} from "@/types/providerModule";
import type { MetadataFact } from "@/types/metadataProvider";
import type {
  Capability,
  MediaType,
  ProviderInfo,
} from "@/types/providerRegistry";
import { cleanCode } from "@/core/identify/query";

import { PROVIDER_MODULES } from "./registry";

export type {
  Capability,
  MediaType,
  ProviderAuth,
  ProviderInfo,
} from "@/types/providerRegistry";

export { PROVIDER_MODULES };

/** Every registered provider module — single discovery entry for the core. */
export function discoverProviderModules(): readonly ProviderModule[] {
  return PROVIDER_MODULES;
}

export const PROVIDERS: ProviderInfo[] = PROVIDER_MODULES.filter(
  (mdl): mdl is ProviderModule => Boolean(mdl?.info),
).map((mdl) => materializeProviderInfo(mdl.info));

export function getProviderModule(id: string): ProviderModule | undefined {
  return PROVIDER_MODULES.find((mdl) => mdl.info.id === id);
}

/** Modules that expose a local/scrape corpus refresh surface. */
export function discoverCatalogProviderModules(): readonly ProviderModule[] {
  return PROVIDER_MODULES.filter((mdl) => Boolean(mdl.catalog));
}

export function getCatalogProviderModule(
  id: string,
): ProviderModule | undefined {
  const mdl = getProviderModule(id);
  return mdl?.catalog ? mdl : undefined;
}

/** Provider that owns a custom cover download path for this remote URL. */
export function providerModuleForCoverDownload(
  url: string,
): ProviderModule | undefined {
  if (!url.startsWith("http")) return undefined;
  return PROVIDER_MODULES.find((mdl) => {
    if (!mdl.localizeCoverDownload) return false;
    const host = mdl.info.coverUrlHost;
    return Boolean(host && url.includes(host));
  });
}

/** Evidence chip label declared by a provider module (server-side). */
export function providerEvidenceLabelFor(providerId: string): string {
  const providerModule = getProviderModule(providerId);
  return (
    providerModule?.evidence?.label ?? providerModule?.info.label ?? providerId
  );
}

const SOURCE_LABEL_BY_KEY = new Map<string, string>();
const PROVIDER_ID_BY_SOURCE_KEY = new Map<string, string>();
const normalizeSourceKey = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "");
for (const mdl of PROVIDER_MODULES) {
  const display = mdl.info.factLabel ?? mdl.info.label;
  for (const key of [
    mdl.info.id,
    mdl.info.label,
    ...(mdl.info.sourceAliases ?? []),
  ]) {
    if (!key) continue;
    const normalized = normalizeSourceKey(key);
    SOURCE_LABEL_BY_KEY.set(normalized, display);
    PROVIDER_ID_BY_SOURCE_KEY.set(normalized, mdl.info.id);
  }
}

/** Canonical provider module id for any source token (id, alias, label, offer source). */
export function providerIdForSourceToken(source: string): string {
  if (!source) return "";
  return (
    PROVIDER_ID_BY_SOURCE_KEY.get(normalizeSourceKey(source)) ??
    normalizeSourceKey(source)
  );
}

/** Display label a provider declares for itself, from any of its source tokens. */
export function formatProviderSourceLabel(source: string): string {
  if (!source) return source;
  return SOURCE_LABEL_BY_KEY.get(normalizeSourceKey(source)) ?? source;
}

const REFERENCE_PRICE_SOURCE_KEYS = new Set<string>();
for (const providerModule of PROVIDER_MODULES) {
  if (!providerModule.info.referencePriceSource) continue;
  for (const key of [
    providerModule.info.id,
    providerModule.info.label,
    ...(providerModule.info.sourceAliases ?? []),
  ]) {
    if (key) REFERENCE_PRICE_SOURCE_KEYS.add(normalizeSourceKey(key));
  }
}

export function isReferencePriceSource(source: string): boolean {
  return (
    !!source && REFERENCE_PRICE_SOURCE_KEYS.has(normalizeSourceKey(source))
  );
}

const BARCODE_SCOPED_PRICE_SOURCE_KEYS = new Set<string>();
for (const providerModule of PROVIDER_MODULES) {
  if (!providerModule.info.barcodeScopedPriceSource) continue;
  for (const key of [
    providerModule.info.id,
    providerModule.info.label,
    ...(providerModule.info.sourceAliases ?? []),
  ]) {
    if (key) BARCODE_SCOPED_PRICE_SOURCE_KEYS.add(normalizeSourceKey(key));
  }
}

export function isBarcodeScopedPriceSource(source: string): boolean {
  return (
    !!source && BARCODE_SCOPED_PRICE_SOURCE_KEYS.has(normalizeSourceKey(source))
  );
}

const MARKETPLACE_SEARCH_PRICE_SOURCE_KEYS = new Set<string>();
for (const providerModule of PROVIDER_MODULES) {
  if (!providerModule.info.marketplaceSearchPriceSource) continue;
  for (const key of [
    providerModule.info.id,
    providerModule.info.label,
    ...(providerModule.info.sourceAliases ?? []),
  ]) {
    if (key) MARKETPLACE_SEARCH_PRICE_SOURCE_KEYS.add(normalizeSourceKey(key));
  }
}

export function isMarketplaceSearchPriceSource(source: string): boolean {
  return (
    !!source &&
    MARKETPLACE_SEARCH_PRICE_SOURCE_KEYS.has(normalizeSourceKey(source))
  );
}

const COVER_HOST_PROVIDERS = PROVIDERS.filter((p) => p.coverUrlHost).map(
  (p) => ({
    host: p.coverUrlHost as string,
    isRealBoxCover: !!p.isRealBoxCover,
  }),
);

export function coverUrlQualityRank(url: string): number {
  if (!url) return 0;
  for (const { host, isRealBoxCover } of COVER_HOST_PROVIDERS) {
    if (url.includes(host)) return isRealBoxCover ? 1 : -1;
  }
  return 0;
}

export function isbnCoverUrlForBarcode(
  mediaType: string,
  barcode: string,
): string | null {
  if (mediaType !== "books") return null;
  const cleaned = cleanCode(barcode);
  if (!cleaned) return null;
  for (const provider of PROVIDERS) {
    const template = provider.isbnCoverUrlTemplate;
    if (template) return template.replace("{isbn}", cleaned);
  }
  return null;
}

export function bookIsbnBootstrapProviderIds(): string[] {
  return PROVIDERS.filter((provider) => provider.bookIsbnBootstrapSource).map(
    (provider) => provider.id,
  );
}

export function inferImageAttachmentFromMediaUrl(
  url: string,
): InferredImageAttachmentSemantics | null {
  for (const providerModule of PROVIDER_MODULES) {
    const inferred = providerModule.inferImageAttachmentFromMediaUrl?.(url);
    if (inferred) return inferred;
  }
  return null;
}

export function isProviderConfigured(p: ProviderInfo): boolean {
  if (p.auth.kind !== "key") return true;
  return p.auth.env.every((name) => Boolean(process.env[name]?.trim()));
}

export function providersForType(type: MediaType): ProviderInfo[] {
  return PROVIDERS.filter((p) => p.types.includes(type));
}

export function nameDatabaseProviderForType(
  type: string,
): ProviderInfo | undefined {
  return PROVIDERS.filter(
    (provider) =>
      provider.nameDatabase &&
      provider.types.some((mediaType) => mediaType === type),
  ).sort((a, b) => Number(b.canonical) - Number(a.canonical))[0];
}

export { scrapeCatalogRetailerLookupEntries } from "@/core/catalog/scrapeRetailers";

export function capabilityCoverage(
  type: MediaType,
  capability: Capability,
): { providers: string[]; count: number } {
  const providers = providersForType(type)
    .filter((p) => p.capabilities.includes(capability))
    .map((p) => p.id);
  return { providers, count: providers.length };
}

function providerSourceKeysForProductUrls(module: ProviderModule): string[] {
  return [
    module.info.id,
    module.info.label,
    ...(module.info.sourceAliases ?? []),
  ]
    .map((key) => key.toLowerCase().replace(/[^a-z0-9]+/g, ""))
    .filter(Boolean);
}

function providerWebsiteHostForProductUrls(
  module: ProviderModule,
): string | null {
  const websiteUrl = module.info.websiteUrl?.trim();
  if (!websiteUrl) return null;
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function factMatchesPriceProviderModule(
  fact: MetadataFact,
  url: string,
  module: ProviderModule,
): boolean {
  if (!module.info.capabilities.includes("price")) return false;
  if (!module.refreshBarcodePriceOffers) return false;

  const factSource = (fact.source ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (
    factSource &&
    providerSourceKeysForProductUrls(module).includes(factSource)
  ) {
    return true;
  }

  const websiteHost = providerWebsiteHostForProductUrls(module);
  if (!websiteHost) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    return host === websiteHost || host.endsWith(`.${websiteHost}`);
  } catch {
    return false;
  }
}

export function providerProductUrlsFromMetadataFacts(
  facts: MetadataFact[] | undefined,
): ProviderProductUrlRef[] {
  if (!facts?.length) return [];

  const linkFacts = facts
    .filter(
      (fact) =>
        (fact.kind === "external-link" || fact.kind === "source-url") &&
        fact.url?.trim(),
    )
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const results: ProviderProductUrlRef[] = [];
  const seen = new Set<string>();

  for (const fact of linkFacts) {
    const url = fact.url!.trim();
    // Attribution chips may point at registry websiteUrl (site root) — those
    // must never drive URL-first price refresh.
    if (!urlLooksLikeProductPagePath(url)) continue;
    for (const providerModule of PROVIDER_MODULES) {
      if (!factMatchesPriceProviderModule(fact, url, providerModule)) continue;

      const dedupeKey = `${providerModule.info.id}\0${url}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      results.push({ providerKey: providerModule.info.id, url });
    }
  }

  return results;
}

/** Site roots / bare hosts are attribution chips, not product fiches. */
function urlLooksLikeProductPagePath(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    return Boolean(path);
  } catch {
    return false;
  }
}

// ── coalesced from src/core/catalog/materializeProviderInfo.ts ──
/** Apply stable defaults to a provider's self-declared `info` (no central overrides). */
export function materializeProviderInfo(info: ProviderInfo): ProviderInfo {
  return {
    ...info,
    defaultLanguage: info.defaultLanguage ?? "unknown",
    isRealBoxCover: info.isRealBoxCover ?? false,
    remoteImageFallback: info.remoteImageFallback ?? false,
    sourceAliases: info.sourceAliases ?? [],
    fullWrapCover: info.fullWrapCover ?? false,
    isSecondary: info.isSecondary ?? false,
    digitalStorefrontArt: info.digitalStorefrontArt ?? false,
    canonicalCover: info.canonicalCover ?? false,
    nameDatabase: info.nameDatabase ?? false,
    rateLimited: info.rateLimited ?? false,
    requiresTitleAlignment: info.requiresTitleAlignment ?? false,
    retailCatalogImageTitles: info.retailCatalogImageTitles ?? false,
    catalogCoverTitles: info.catalogCoverTitles ?? false,
    strictShelfPlatformCover: info.strictShelfPlatformCover ?? false,
    authoritative3dCoverRole: info.authoritative3dCoverRole ?? false,
    gridStyleCoverLabels: info.gridStyleCoverLabels ?? false,
    collectorCoverRegionFromAgeRating:
      info.collectorCoverRegionFromAgeRating ?? false,
    supplyMode: info.supplyMode ?? "api_live",
  };
}
