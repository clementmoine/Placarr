import type { AttachmentType } from "@prisma/client";

import type { MetadataResult } from "@/types/metadataProvider";
import type { ProviderInfo } from "@/types/providerRegistry";
import type { BarcodeLookupPayload } from "@/lib/barcode/lookup/payload";
import type { PriceOfferInput } from "@/services/metadata/evidence";

export type InferredImageAttachmentSemantics = {
  type: AttachmentType;
  role?: string;
  source: string;
};

export type MetadataAdapterContext = {
  name: string;
  type?: string | null;
  barcode?: string | null;
  platform?: string | null;
  shelfName?: string | null;
  lookupQueries?: string[];
  includePcSources?: boolean;
  imdbId?: string | null;
  externalIds?: Record<string, string | null>;
  fallbackNames?: string[];
  isBackground?: boolean;
  signal?: AbortSignal;
};

export interface MetadataProviderAdapter {
  id: string;
  resolve(ctx: MetadataAdapterContext): Promise<MetadataResult | null>;
}

export type BarcodeLookupType =
  | "games"
  | "books"
  | "musics"
  | "movies"
  | "boardgames"
  | "generic";

export type BarcodeLookupContext = {
  barcode: string;
  platformKey?: string | null;
};

export type BarcodePriceRefreshContext = {
  cleanedBarcode: string;
  shelfType: string;
  shelfName?: string | null;
  primaryName: string;
  fallbackNames: string[];
  leDenicheurQueries: string[];
  isPal: boolean;
  isClassics: boolean;
};

export type CatalogExternalLinkContext = {
  mediaType: string;
  title?: string | null;
  fallbackTitle?: string | null;
  shelfName?: string | null;
  barcode?: string | null;
  aliases?: string[];
};

export type CatalogExternalLink = {
  url: string;
  isDirect?: boolean;
  /** Registry evidence/display label for the provider that built the link. */
  providerLabel?: string;
};

export type DatabaseTitleSuggestionContext = {
  name: string;
  cleanedName: string;
  platform?: string | null;
};

export type GameBarcodeEnrichmentDeps = {
  fetchReferencePriceByBarcode?: (
    barcode: string,
    searchName: string,
    platform: string,
    isPal: boolean,
    isClassics: boolean,
  ) => Promise<unknown>;
  fetchGameMediaByBarcode?: (
    name: string,
    barcode: string,
    platform: string,
  ) => Promise<unknown>;
  fetchMovieByTitle?: (title: string) => Promise<unknown>;
};

/** Context for turning a barcode lookup payload into per-type evidence sources. */
export type BarcodeSourceContext = {
  type: string | null;
  isBook: boolean;
  cleanedBarcode: string;
};

/**
 * One provider's contribution of evidence products to a media type, extracted
 * from its own slice of the lookup payload. `label` is the exact evidence
 * `providerName` (preserved verbatim from the former central assembler, since
 * downstream evidence classification matches on it).
 */
export type BarcodeSourceContribution = {
  mediaType: BarcodeLookupType;
  label: string;
  products: SourceProduct[];
};

export type BarcodeLookupDeps = {
  fetchMetadataFromPriceCharting: (
    barcode: string,
    searchName?: string,
    preferredPlatform?: string,
    isPal?: boolean,
    isClassics?: boolean,
  ) => Promise<unknown>;
  fetchFromChasseAuxLivres: (
    barcode: string,
    category: string,
    opts?: { withPrices?: boolean },
  ) => Promise<unknown>;
  fetchFromScanDex: (barcode: string) => Promise<unknown>;
  fetchFromAchatMoinsCher: (barcode: string) => Promise<unknown>;
  fetchFromFreakxy: (barcode: string) => Promise<unknown>;
  fetchFromPicClick: (barcode: string) => Promise<unknown>;
  fetchPricesFromLeDenicheur: (
    queryOrQueries: string | string[],
  ) => Promise<unknown>;
  fetchFromOpenLibrary: (
    name: string,
    barcode?: string | null,
  ) => Promise<unknown>;
  fetchFromGoogleBooks: (
    name: string,
    barcode?: string | null,
  ) => Promise<unknown>;
  fetchFromDeezer: (name: string, barcode?: string | null) => Promise<unknown>;
  fetchFromMusicBrainz: (barcode: string) => Promise<unknown>;
  fetchFromDiscogs: (barcode: string) => Promise<unknown>;
  fetchICollectMetadataByBarcode: (barcode: string) => Promise<unknown>;
};

export interface ProviderEvidenceConfig {
  label: string;
  sourceWeight: number;
  canonical?: boolean;
  /** Official retailer product pages (barcode-confirmed), below catalog sources. */
  trustedRetailer?: boolean;
  cleanCachedNames?: boolean;
}

export interface ProviderHealthStatus {
  name: string;
  type: "metadata";
  configured: boolean;
  status: "up" | "down" | "unconfigured";
  latency: number | null;
  error: string | null;
  credits: null;
}

export interface ProviderHealthCheck {
  providerId: string;
  run: () => Promise<ProviderHealthStatus>;
}

export type TestProviderHandlerKind =
  | "scraped-list"
  | "prices"
  | "metadata-barcode"
  | "metadata"
  | "cover";

export interface TestProviderFormatContext {
  processScrapedNames: (
    rawNames: string[] | undefined,
    type: string | null,
  ) => Promise<{
    rawNames: string[] | null;
    extractedName: string | null;
    suggestions: string[];
  }>;
}

export interface TestProviderHandler {
  label: string;
  kind: TestProviderHandlerKind;
  run: (query: string, type: string | null) => Promise<unknown>;
  formatResult?: (
    resolved: unknown,
    type: string | null,
    ctx: TestProviderFormatContext,
  ) => Promise<unknown>;
}

export interface ProviderMappingProbeSample {
  sampleInput: string;
  context: MetadataAdapterContext;
}

export interface ProviderMappingProbe {
  sampleInput: string;
  context: MetadataAdapterContext;
  fallbackBarcodes?: string[];
  catalog?: string;
  /**
   * Extra sample inputs probed alongside the primary one; their raw + mapped
   * keys are unioned so the audit sees fields that only some products expose
   * (e.g. a Discogs release with `videos`/`notes`). Opt-in per provider.
   */
  additionalSamples?: ProviderMappingProbeSample[];
}

export type MappingProbeStatus =
  | "ok"
  | "partial"
  | "empty"
  | "blocked"
  | "error";

export interface MappingProbeResult {
  rawKeys: string[];
  mappedKeys: string[];
  unusedKeys: string[];
  attachmentsCount: number;
  factsCount: number;
  example: string | null;
  reason?: string;
  statusHint?: MappingProbeStatus;
}

export interface ProviderModule {
  info: ProviderInfo;
  evidence?: ProviderEvidenceConfig;
  createMetadataAdapter?: (
    deps?: Record<string, unknown>,
  ) => MetadataProviderAdapter | null;
  /**
   * Title suggestions for manual item entry / association modals. Implemented by
   * providers that declare `nameDatabase` for a media type.
   */
  suggestDatabaseTitles?: (
    ctx: DatabaseTitleSuggestionContext,
  ) => Promise<string[]>;
  mappingProbe?: ProviderMappingProbe;
  runMappingProbe?: () => Promise<MappingProbeResult | null>;
  /**
   * Live raw keys for a sample. Receives the probed context so the audit can
   * union keys across multiple samples; implementations may ignore it and fall
   * back to their default sample (backward compatible).
   */
  collectMappingRawKeys?: (
    context?: MetadataAdapterContext,
  ) => Promise<string[]>;
  healthCheck?: ProviderHealthCheck;
  /** When set, metadata fetch skips this provider while its quota cooldown is active. */
  isMetadataQuotaBlocked?: () => boolean;
  /**
   * Turn this provider's slice of a barcode lookup payload into price offers
   * captured during identification (one network call, single-product match).
   */
  extractScanPriceOffers?: (
    payload: BarcodeLookupPayload,
    shelfType: string,
  ) => PriceOfferInput[];
  /**
   * Fetch fresh barcode-scoped price offers for a background refresh. Return an
   * empty array when this provider does not apply to the shelf type/context.
   */
  refreshBarcodePriceOffers?: (
    ctx: BarcodePriceRefreshContext,
  ) => Promise<PriceOfferInput[]>;
  /** Registers barcode lookup fetchers for dependency injection. */
  contributeBarcodeLookupDeps?: () => Partial<BarcodeLookupDeps>;
  /**
   * Build an external catalog link (reference price / market lookup) for items
   * of a supported media type.
   */
  buildCatalogExternalLink?: (
    ctx: CatalogExternalLinkContext,
  ) => CatalogExternalLink | null;
  /** Registers post-barcode enrichment fetchers (reference price, game media, movies). */
  contributeGameBarcodeEnrichment?: () => Partial<GameBarcodeEnrichmentDeps>;
  buildBarcodeTasks?: (
    deps: BarcodeLookupDeps,
    type: BarcodeLookupType,
    context: BarcodeLookupContext,
  ) => Record<string, Promise<unknown>>;
  /**
   * Turn this provider's slice of the lookup payload into evidence sources,
   * tagged by media type. Plug-and-play replacement for the central assembler:
   * core iterates the registry instead of hard-coding each provider.
   */
  buildBarcodeSources?: (
    payload: BarcodeLookupPayload,
    ctx: BarcodeSourceContext,
  ) => BarcodeSourceContribution[];
  buildTeardownBarcodeTasks?: (
    ctx: TeardownBarcodeContext,
    deps: BarcodeLookupDeps,
  ) => TeardownProviderTask[];
  buildTeardownMetadataTasks?: (
    ctx: TeardownMetadataContext,
  ) => TeardownProviderTask[];
  testHandlers?: Record<string, TestProviderHandler>;
  /**
   * Expand a canonical cover URL into ordered download candidates (CDN path
   * variants, slug forms, size fallbacks). Used during image localization.
   */
  expandCoverDownloadCandidates?: (url: string) => string[];
  /**
   * Infer attachment type/role/source from a remote media URL owned by this
   * provider (e.g. ScreenScraper mediaJeu.php query params).
   */
  inferImageAttachmentFromMediaUrl?: (
    url: string,
  ) => InferredImageAttachmentSemantics | null;
}

export type TeardownProviderTaskPhase = "barcode" | "metadata" | "merged";

export interface TeardownProviderTask {
  providerLabel: string;
  phase: TeardownProviderTaskPhase;
  run: () => Promise<unknown>;
}

export interface TeardownBarcodeContext {
  barcode: string;
  type: string | null;
  nameCandidates?: string[];
}

export interface TeardownMetadataContext {
  name: string;
  type: string;
  barcode: string | null;
  platform: string | null;
  includeTypeInLabel: boolean;
}
