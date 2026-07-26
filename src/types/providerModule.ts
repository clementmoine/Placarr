import type { AttachmentType } from "@/generated/prisma/browser";

import type { SourceProduct } from "@/core/identify/evidence/types";
import type { MetadataResult } from "@/types/metadataProvider";
import type { ProviderInfo } from "@/types/providerRegistry";
import type { BarcodeLookupPayload } from "@/core/identify/lookup/payload";
import type { PriceOfferInput } from "@/core/enrich/evidence";

export type InferredImageAttachmentSemantics = {
  type: AttachmentType;
  role?: string;
  source: string;
};

/**
 * Shared match inputs: every provider may contribute (aliases, EAN/UPC,
 * releaseDate, external ids…) and every provider should consume the same bag
 * for hard match / search decisions. Built once per enrich or price pass.
 */
export type MatchContext = {
  /** Digits-only barcodes known for this item (EAN / UPC / ISBN…). Preferred first. */
  barcodes: string[];
  /**
   * Print identity for objects that never carry a barcode — a trading card is
   * anchored by what is printed on it (game, set, collector number). Sits
   * alongside `barcodes` rather than inside it: a print key is not a barcode,
   * and a column that lies costs more than the extra field.
   * See `@/core/identify/printKey`.
   */
  printKey?: string | null;
  /** Primary display title. */
  primaryTitle: string;
  /**
   * Soft match / search titles (aliases, regional, query expansions).
   * Deduped; primaryTitle is first when present.
   */
  titles: string[];
  /**
   * Titles trusted for hard acceptance / marketplace validation
   * (primary + strong fallbacks — excludes weak alias noise).
   */
  acceptanceTitles: string[];
  shelfType: string;
  shelfName?: string | null;
  platformKey?: string | null;
  /** ISO date `YYYY-MM-DD` when known from metadata consensus. */
  releaseDate?: string | null;
  isPal?: boolean;
  isClassics?: boolean;
  providerProductUrls?: readonly ProviderProductUrlRef[];
  externalIds?: Record<string, string | null | undefined>;
};

export type RomChecksums = {
  crc?: string | null;
  md5?: string | null;
  sha1?: string | null;
};

export type MetadataAdapterContext = {
  name: string;
  type?: string | null;
  barcode?: string | null;
  /** Print identity for barcode-less objects. See {@link MatchContext.printKey}. */
  printKey?: string | null;
  platform?: string | null;
  shelfName?: string | null;
  lookupQueries?: string[];
  includePcSources?: boolean;
  imdbId?: string | null;
  externalIds?: Record<string, string | null>;
  /**
   * Absolute fiche/product URLs already known for this item (from stored
   * external-link facts). Prefer over title/barcode seek when present.
   */
  providerRecordUrls?: Record<string, string>;
  fallbackNames?: string[];
  /** ISO release date from prior consensus — soft discriminant for remakes. */
  releaseDate?: string | null;
  /**
   * ROM dump checksums when known (file ingest / prior No-Intro hit).
   * Tier0 dump providers prefer sha1 > md5 > crc over title search.
   */
  romChecksums?: RomChecksums;
  /**
   * Shared match bag for this enrich pass. Prefer reading titles / barcodes /
   * releaseDate from here when present; scalar fields above stay for compat.
   */
  match?: MatchContext;
  isBackground?: boolean;
  /** Interactive lookups (preview API) jump ahead of background enrichment. */
  queuePriority?: "high" | "normal";
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
  | "hardware"
  | "tcg"
  | "toys"
  | "generic";

export type BarcodeLookupContext = {
  barcode: string;
  platformKey?: string | null;
};

export type ProviderProductUrlRef = {
  providerKey: string;
  url: string;
};

/**
 * Price-refresh view of {@link MatchContext} with legacy field aliases used by
 * existing `refreshBarcodePriceOffers` implementations. Prefer `titles` /
 * `barcodes` / `releaseDate` / `acceptanceTitles` for new code.
 */
export type BarcodePriceRefreshContext = MatchContext & {
  /** Preferred barcode (`barcodes[0]`), or `""` for title-only refresh. */
  cleanedBarcode: string;
  /** Alias of `primaryTitle`. */
  primaryName: string;
  /** Search titles excluding primary (`titles` without `primaryTitle`). */
  fallbackNames: string[];
  /** LeDénicheur-style query list (barcode + title variants). */
  leDenicheurQueries: string[];
  isPal: boolean;
  isClassics: boolean;
  /** Job abort — stop launching further provider scrapes when set. */
  signal?: AbortSignal;
  /**
   * Rejoue uniquement ProviderEvidence frais (SearchYield / DetailYield) —
   * aucun HTTP. Miss evidence ⇒ offre vide pour ce provider.
   */
  evidenceOnly?: boolean;
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

/** One volume in a publisher series with a discovered barcode (e.g. AbeBooks). */
export type SeriesVolumeBarcode = {
  volume: string;
  barcode: string;
  title: string;
  coverUrl?: string;
};

export type SeriesVolumeBarcodeContext = {
  seedBarcode: string;
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
    options?: { mediaType?: string | null },
  ) => Promise<unknown>;
  fetchFromChasseAuxLivres: (
    barcode: string,
    category: string,
    opts?: { withPrices?: boolean },
  ) => Promise<unknown>;
  fetchFromScanDex: (barcode: string) => Promise<unknown>;
  fetchFromAchatMoinsCher: (barcode: string) => Promise<unknown>;
  fetchFromFreakxy: (barcode: string) => Promise<unknown>;
  fetchFromEbay: (barcode: string) => Promise<unknown>;
  fetchPricesFromLeDenicheur: (
    queryOrQueries: string | string[],
    options?: { itemBarcode?: string | null },
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
  /**
   * Local barcode catalog rows (e.g. offline index) may anchor official display
   * titles without full canonical weight.
   */
  catalogTitleAnchor?: boolean;
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

/**
 * Probe samples may be barcode-only (Magento retailers seek by EAN), so the
 * name is optional here — the audit fills it in before calling an adapter.
 */
export type ProviderMappingProbeContext = Omit<MetadataAdapterContext, "name"> &
  Partial<Pick<MetadataAdapterContext, "name">>;

export interface ProviderMappingProbeSample {
  sampleInput: string;
  context: ProviderMappingProbeContext;
}

export interface ProviderMappingProbe {
  sampleInput: string;
  context: ProviderMappingProbeContext;
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
    context?: ProviderMappingProbeContext,
  ) => Promise<string[]>;
  healthCheck?: ProviderHealthCheck;
  /** When set, metadata fetch skips this provider while its quota cooldown is active. */
  isMetadataQuotaBlocked?: () => boolean;
  /**
   * Parse a durable provider record id from a stored fiche / product URL so
   * metadata refresh can skip title/barcode seek when the fiche is already known.
   */
  parseMetadataRecordIdFromUrl?: (url: string) => string | null;
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
  /**
   * True when `url` is a verified product/fiche URL for this provider
   * (not a search page). Used to prefer scraped links over heuristic search.
   */
  isVerifiedCatalogProductUrl?: (url: string) => boolean;
  /**
   * Rewrite a stored/scraped URL into the canonical public product page when
   * needed (e.g. API endpoints that should never be shown to collectors).
   * Return null when the URL is not owned by this provider.
   */
  normalizeCatalogProductUrl?: (
    url: string,
    ctx?: { platformKey?: string | null },
  ) => string | null;
  /** Registers post-barcode enrichment fetchers (reference price, game media, movies). */
  contributeGameBarcodeEnrichment?: () => Partial<GameBarcodeEnrichmentDeps>;
  /**
   * From a seed ISBN/EAN that hit this provider's series catalog, return other
   * volumes in the same series with their barcodes (for filling barcode-less
   * shelf siblings). Empty when the seed is not in a series.
   */
  contributeSeriesVolumeBarcodes?: (
    ctx: SeriesVolumeBarcodeContext,
  ) => Promise<SeriesVolumeBarcode[]>;
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
  /**
   * Empty value for each barcode-lookup slot this provider owns, keyed by slot
   * name. Declare it next to the matching `declare module` augmentation of
   * `BarcodeLookupSlots` so the type and its default stay adjacent.
   */
  barcodeLookupSlots?: Record<string, () => unknown>;
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
   * Provider-owned cover localization (CDN-specific download / upgrade). When
   * set, core calls this instead of the generic remote download path for URLs
   * matching `info.coverUrlHost`.
   */
  localizeCoverDownload?: (
    url: string,
    options?: {
      source?: string;
      itemId?: string;
      metadataId?: string;
      trim?: boolean;
    },
  ) => Promise<string | null>;
  /**
   * Infer attachment type/role/source from a remote media URL owned by this
   * provider (e.g. ScreenScraper mediaJeu.php query params).
   */
  inferImageAttachmentFromMediaUrl?: (
    url: string,
  ) => InferredImageAttachmentSemantics | null;
  /**
   * When an item barcode is known, validate a stored product-page URL against
   * GTIN/EAN read from the live page. Return true when the page contradicts
   * the item (the external link should be dropped).
   */
  validateStoredExternalLinkAgainstBarcode?: (
    url: string,
    itemBarcode: string,
    itemTitle?: string | null,
  ) => Promise<boolean>;
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
