import type { MetadataResult } from "@/types/metadataProvider";
import type { ProviderInfo } from "@/types/providerRegistry";

export type MetadataAdapterContext = {
  name: string;
  barcode?: string | null;
  platform?: string | null;
  includePcSources?: boolean;
  imdbId?: string | null;
  fallbackNames?: string[];
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
  ) => Promise<unknown>;
  fetchFromScanDex: (barcode: string) => Promise<unknown>;
  fetchFromAchatMoinsCher: (barcode: string) => Promise<unknown>;
  fetchFromFreakxy: (barcode: string) => Promise<unknown>;
  fetchFromApriloshop: (barcode: string) => Promise<unknown>;
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
  | "scandex"
  | "prices"
  | "metadata-barcode"
  | "metadata"
  | "cover";

export interface TestProviderHandler {
  label: string;
  kind: TestProviderHandlerKind;
  run: (query: string, type: string | null) => Promise<unknown>;
}

export interface ProviderMappingProbe {
  sampleInput: string;
  context: MetadataAdapterContext;
  fallbackBarcodes?: string[];
  catalog?: string;
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
    deps: Record<string, unknown>,
  ) => MetadataProviderAdapter | null;
  mappingProbe?: ProviderMappingProbe;
  runMappingProbe?: () => Promise<MappingProbeResult | null>;
  collectMappingRawKeys?: () => Promise<string[]>;
  healthCheck?: ProviderHealthCheck;
  buildBarcodeTasks?: (
    deps: BarcodeLookupDeps,
    type: BarcodeLookupType,
    context: BarcodeLookupContext,
  ) => Record<string, Promise<unknown>>;
  buildTeardownBarcodeTasks?: (
    ctx: TeardownBarcodeContext,
    deps: BarcodeLookupDeps,
  ) => TeardownProviderTask[];
  buildTeardownMetadataTasks?: (
    ctx: TeardownMetadataContext,
  ) => TeardownProviderTask[];
  testHandlers?: Record<string, TestProviderHandler>;
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
