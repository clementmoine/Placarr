import { achatmoinscherModule } from "@/services/providers/achatmoinscher";
import { bggModule } from "@/services/providers/bgg";
import { booknodeModule } from "@/services/providers/booknode";
import { bedethequeModule } from "@/services/providers/bedetheque";
import { chocobonplanModule } from "@/services/providers/chocobonplan";
import { chasseauxlivresModule } from "@/services/providers/chasseauxlivres";
import { launchboxModule } from "@/services/providers/launchbox";
import { coverprojectModule } from "@/services/providers/coverproject";
import { deezerModule } from "@/services/providers/deezer";
import { discogsModule } from "@/services/providers/discogs";
import { ebayModule } from "@/services/providers/ebay";
import { freakxyModule } from "@/services/providers/freakxy";
import { geedieModule } from "@/services/providers/geedie";
import { hdjvModule } from "@/services/providers/hdjv";
import { howlongtobeatModule } from "@/services/providers/howlongtobeat";
import { icollectModule } from "@/services/providers/icollect";
import { igdbModule } from "@/services/providers/igdb";
import { ledenicheurModule } from "@/services/providers/ledenicheur";
import { musicbrainzModule } from "@/services/providers/musicbrainz";
import { omdbModule } from "@/services/providers/omdb";
import { googlebooksModule } from "@/services/providers/googlebooks";
import { openlibraryModule } from "@/services/providers/openlibrary";
import { philibertModule } from "@/services/providers/philibert";
import { okkazeoModule } from "@/services/providers/okkazeo";
import { espritjeuModule } from "@/services/providers/espritjeu";
import { myludoModule } from "@/services/providers/myludo";
import { playinModule } from "@/services/providers/playin";
import { PRESTASHOP_RETAILER_MODULES } from "@/services/providers/prestashop";
import { SHOPIFY_RETAILER_MODULES } from "@/services/providers/shopify";
import { wikidataModule } from "@/services/providers/wikidata";
import { pricechartingModule } from "@/services/providers/pricecharting";
import { rawgModule } from "@/services/providers/rawg";
import { scandexModule } from "@/services/providers/scandex";
import { screenscraperModule } from "@/services/providers/screenscraper";
import { smartoysModule } from "@/services/providers/smartoys";
import { steamModule } from "@/services/providers/steam";
import { steamgriddbModule } from "@/services/providers/steamgriddb";
import { thegamesdbModule } from "@/services/providers/thegamesdb";
import { tmdbModule } from "@/services/providers/tmdb";

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
import { cleanCode } from "@/lib/barcode/query";

export type {
  Capability,
  MediaType,
  ProviderAuth,
  ProviderInfo,
} from "@/types/providerRegistry";

export const PROVIDER_MODULES: ProviderModule[] = [
  screenscraperModule,
  thegamesdbModule,
  launchboxModule,
  igdbModule,
  rawgModule,
  steamgriddbModule,
  steamModule,
  howlongtobeatModule,
  pricechartingModule,
  icollectModule,
  smartoysModule,
  coverprojectModule,
  musicbrainzModule,
  discogsModule,
  deezerModule,
  tmdbModule,
  omdbModule,
  openlibraryModule,
  googlebooksModule,
  booknodeModule,
  bedethequeModule,
  bggModule,
  wikidataModule,
  philibertModule,
  okkazeoModule,
  espritjeuModule,
  myludoModule,
  playinModule,
  ...PRESTASHOP_RETAILER_MODULES,
  ...SHOPIFY_RETAILER_MODULES,
  chasseauxlivresModule,
  achatmoinscherModule,
  ledenicheurModule,
  chocobonplanModule,
  geedieModule,
  hdjvModule,
  freakxyModule,
  ebayModule,
  scandexModule,
];

type ProviderMetadataExtension = Partial<
  Pick<
    ProviderInfo,
    | "defaultLanguage"
    | "isRealBoxCover"
    | "imageScoreAdjustment"
    | "remoteImageFallback"
    | "isSecondary"
    | "retailCatalogImageTitles"
    | "strictShelfPlatformCover"
    | "authoritative3dCoverRole"
    | "gridStyleCoverLabels"
    | "collectorCoverRegionFromAgeRating"
    | "coverDefaultRegion"
  >
>;

const PROVIDER_METADATA_EXTENSIONS: Record<string, ProviderMetadataExtension> =
  {
    screenscraper: {
      defaultLanguage: "fr",
      isRealBoxCover: true,
      authoritative3dCoverRole: true,
    },
    igdb: { defaultLanguage: "en" },
    thegamesdb: { defaultLanguage: "en", isRealBoxCover: true },
    launchbox: { defaultLanguage: "en", isRealBoxCover: true },
    coverproject: { isRealBoxCover: true },
    howlongtobeat: { imageScoreAdjustment: -500 },
    steam: { defaultLanguage: "en" },
    rawg: { defaultLanguage: "en" },
    steamgriddb: {
      authoritative3dCoverRole: true,
      gridStyleCoverLabels: true,
    },
    pricecharting: {
      isRealBoxCover: true,
      imageScoreAdjustment: 160,
    },
    tmdb: { defaultLanguage: "fr" },
    omdb: { defaultLanguage: "en", isSecondary: true },
    openlibrary: { defaultLanguage: "en" },
    googlebooks: { defaultLanguage: "en" },
    booknode: {
      defaultLanguage: "fr",
      isRealBoxCover: true,
    },
    bedetheque: {
      defaultLanguage: "fr",
      isRealBoxCover: true,
    },
    boardgamegeek: { defaultLanguage: "en", isRealBoxCover: true },
    philibert: { defaultLanguage: "fr", isRealBoxCover: true },
    okkazeo: { defaultLanguage: "fr", isRealBoxCover: true },
    espritjeu: { defaultLanguage: "fr", isRealBoxCover: true },
    playin: { defaultLanguage: "fr", isRealBoxCover: true },
    ledenicheur: { defaultLanguage: "fr" },
    freakxy: { defaultLanguage: "fr", isRealBoxCover: true },
    ebay: {
      imageScoreAdjustment: -280,
      remoteImageFallback: true,
      isSecondary: true,
    },
  };

export const PROVIDERS: ProviderInfo[] = PROVIDER_MODULES.map((mdl) => {
  const ext = PROVIDER_METADATA_EXTENSIONS[mdl.info.id] || {};
  return {
    ...mdl.info,
    defaultLanguage:
      mdl.info.defaultLanguage ?? ext.defaultLanguage ?? "unknown",
    isRealBoxCover: mdl.info.isRealBoxCover ?? ext.isRealBoxCover ?? false,
    imageScoreAdjustment:
      mdl.info.imageScoreAdjustment ?? ext.imageScoreAdjustment,
    coverUrlHost: mdl.info.coverUrlHost,
    remoteImageFallback:
      mdl.info.remoteImageFallback ?? ext.remoteImageFallback ?? false,
    remoteImageReferer: mdl.info.remoteImageReferer,
    remoteImageFlareTimeoutMs: mdl.info.remoteImageFlareTimeoutMs,
    bookCoverPriority: mdl.info.bookCoverPriority,
    sourceAliases: mdl.info.sourceAliases ?? [],
    fullWrapCover: mdl.info.fullWrapCover ?? false,
    isSecondary: mdl.info.isSecondary ?? ext.isSecondary ?? false,
    digitalStorefrontArt: mdl.info.digitalStorefrontArt ?? false,
    canonicalCover: mdl.info.canonicalCover ?? false,
    nameDatabase: mdl.info.nameDatabase ?? false,
    rateLimited: mdl.info.rateLimited ?? false,
    requiresTitleAlignment: mdl.info.requiresTitleAlignment ?? false,
    retailCatalogImageTitles:
      mdl.info.retailCatalogImageTitles ??
      ext.retailCatalogImageTitles ??
      false,
    strictShelfPlatformCover:
      mdl.info.strictShelfPlatformCover ??
      ext.strictShelfPlatformCover ??
      false,
    authoritative3dCoverRole:
      mdl.info.authoritative3dCoverRole ??
      ext.authoritative3dCoverRole ??
      false,
    gridStyleCoverLabels:
      mdl.info.gridStyleCoverLabels ?? ext.gridStyleCoverLabels ?? false,
    collectorCoverRegionFromAgeRating:
      mdl.info.collectorCoverRegionFromAgeRating ??
      ext.collectorCoverRegionFromAgeRating ??
      false,
    coverDefaultRegion: mdl.info.coverDefaultRegion ?? ext.coverDefaultRegion,
  };
});

export function getProviderModule(id: string): ProviderModule | undefined {
  return PROVIDER_MODULES.find((mdl) => mdl.info.id === id);
}

/** Evidence chip label declared by a provider module (server-side). */
export function providerEvidenceLabelFor(providerId: string): string {
  const providerModule = getProviderModule(providerId);
  return (
    providerModule?.evidence?.label ?? providerModule?.info.label ?? providerId
  );
}

// Display label for a source token (provider id, alias, or stored label) → the
// provider's own declared name, built once from the registry. Replaces the
// per-provider switch that used to live in core (playerFacts).
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

/**
 * Canonical provider module id for any source token (id, alias, label, offer source).
 * Falls back to a normalized token when no module claims it.
 */
export function providerIdForSourceToken(source: string): string {
  if (!source) return "";
  return (
    PROVIDER_ID_BY_SOURCE_KEY.get(normalizeSourceKey(source)) ??
    normalizeSourceKey(source)
  );
}

/**
 * The display label a provider declares for itself, resolved from any of its
 * source tokens (id / alias / label). Returns the input unchanged for tokens no
 * provider claims (e.g. the synthetic "consensus" source). Fully registry-driven
 * — adding a provider never touches a central switch.
 */
export function formatProviderSourceLabel(source: string): string {
  if (!source) return source;
  return SOURCE_LABEL_BY_KEY.get(normalizeSourceKey(source)) ?? source;
}

// Source keys (id / alias / label) of providers that supply authoritative
// reference/catalog prices — registry-driven, so the price policy never names a
// provider.
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

/** Whether a price-offer source token comes from a reference-price provider. */
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

/** Whether a price row was fetched from the item barcode, not a search hit. */
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

/** Whether a price row comes from a broad marketplace search listing. */
export function isMarketplaceSearchPriceSource(source: string): boolean {
  return (
    !!source &&
    MARKETPLACE_SEARCH_PRICE_SOURCE_KEYS.has(normalizeSourceKey(source))
  );
}

// Providers that tag their cover URLs with a recognisable host, with whether
// those covers are real box art — registry-driven, so cover ranking names no
// provider in core.
const COVER_HOST_PROVIDERS = PROVIDERS.filter((p) => p.coverUrlHost).map(
  (p) => ({
    host: p.coverUrlHost as string,
    isRealBoxCover: !!p.isRealBoxCover,
  }),
);

/**
 * Cover-quality rank for an image URL: +1 for a real box cover, −1 for a known
 * non-box (screenshot) source, 0 when the provider can't be identified. Used to
 * prefer authoritative box art when several cached covers exist.
 */
export function coverUrlQualityRank(url: string): number {
  if (!url) return 0;
  for (const { host, isRealBoxCover } of COVER_HOST_PROVIDERS) {
    if (url.includes(host)) return isRealBoxCover ? 1 : -1;
  }
  return 0;
}

/** ISBN cover URL from the first provider that declares a template (books only). */
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

/** Provider ids to re-query when a discovered ISBN replaces a missing barcode. */
export function bookIsbnBootstrapProviderIds(): string[] {
  return PROVIDERS.filter((provider) => provider.bookIsbnBootstrapSource).map(
    (provider) => provider.id,
  );
}

/** First provider module that recognises its own remote media URL pattern. */
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
  // Generic check: a key-auth provider is configured once all of its declared
  // env vars are set. (ScreenScraper's DEV_ID/DEV_PASSWORD and TheGamesDB's API
  // key are exactly those, so no per-provider special case is needed.)
  if (p.auth.kind !== "key") return true;
  return p.auth.env.every((name) => Boolean(process.env[name]?.trim()));
}

export function providersForType(type: MediaType): ProviderInfo[] {
  return PROVIDERS.filter((p) => p.types.includes(type));
}

/**
 * Provider owning the authoritative name database for a type. Canonical
 * declarers win over scrape-based ones (books: openlibrary over
 * booknode/bedetheque) ; l'ordre registry départage — la sélection par type
 * est épinglée par `nameDatabaseProvider.test.ts`.
 */
export function nameDatabaseProviderForType(
  type: string,
): ProviderInfo | undefined {
  return PROVIDERS.filter(
    (provider) =>
      provider.nameDatabase &&
      provider.types.some((mediaType) => mediaType === type),
  ).sort((a, b) => Number(b.canonical) - Number(a.canonical))[0];
}

export { scrapeCatalogRetailerLookupEntries } from "@/services/provider/scrapeRetailers";

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

/**
 * Product-page URLs already resolved during metadata enrichment. Price refresh
 * reuses them before barcode/title search so providers are not queried twice.
 */
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
