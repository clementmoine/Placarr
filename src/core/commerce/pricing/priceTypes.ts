import type { ProviderProductUrlRef } from "@/types/providerModule";

export type PriceObservation = {
  source: string;
  productName?: string | null;
  merchantName?: string | null;
  condition?: string | null;
  priceCents: number;
  currency?: string | null;
  sourceUrl?: string | null;
  offerCount?: number | null;
  observedAt?: Date | string | null;
  /** Metadata-derived catalog price — skip marketplace listing title filters. */
  metadataScoped?: boolean;
  catalogEstimateMinCents?: number;
  catalogEstimateMaxCents?: number;
  catalogEstimateDisplayValue?: string;
};

export type SerializedPriceObservation = {
  source: string;
  productName?: string | null;
  merchantName?: string | null;
  condition?: string | null;
  priceCents: number;
  currency?: string | null;
  sourceUrl?: string | null;
  offerCount?: number | null;
  observedAt?: string | null;
  isReferencePriceSource?: boolean;
  sourceDisplayLabel?: string;
  metadataScoped?: boolean;
  catalogEstimateMinCents?: number;
  catalogEstimateMaxCents?: number;
  catalogEstimateDisplayValue?: string;
};

export type BarcodePricesResult = {
  priceNew: number | null;
  /** EUR average of market `foil` observations (TCG finishes). */
  priceFoil?: number | null;
  priceUsed: number | null;
  priceUsedCIB: number | null;
  /**
   * Point price derived from catalog estimates (cote « de 5 à 10 € » →
   * médian 7,50 €). Lowest-priority value: display and totals only fall
   * back to it when no observed price exists, and mark it as an estimate.
   * For TCG this is the non-foil (or sole) FX / catalog ~.
   */
  priceEstimated?: number | null;
  /** FX ~ for the foil market bucket when no native EUR foil exists. */
  priceEstimatedFoil?: number | null;
  priceLastUpdated: Date | null;
  priceSources: string[];
  /** Display labels aligned with `priceSources` (registry-derived, server-stamped). */
  priceSourceDisplayNames: string[];
  /** True when the only price source is a reference/catalog database provider. */
  isReferencePriceOnly: boolean;
  priceObservations: SerializedPriceObservation[];
};

export type RefreshBarcodePricesInput = {
  cleanedBarcode: string;
  shelfType: string;
  /** Shelf/platform name, used for region (PAL/NTSC) and provider context. */
  shelfName?: string | null;
  /** Primary display name (item or scanned match) used in game heuristics. */
  primaryName: string;
  /** Extra query names (metadata title, aliases…) merged ahead of cached raw names. */
  extraNames?: string[];
  /** Titles trusted for hard marketplace validation (no weak aliases). */
  acceptanceNames?: string[];
  /** Extra barcodes contributed by metadata (EAN/UPC/ISBN…). */
  extraBarcodes?: string[];
  platformKey?: string | null;
  releaseDate?: string | null;
  externalIds?: Record<string, string | null | undefined>;
  /** Product-page URLs from metadata facts, keyed by provider id. */
  providerProductUrls?: readonly ProviderProductUrlRef[];
  /** Print identity for barcode-less objects when known alongside a barcode. */
  printKey?: string | null;
  /** Abort in-flight marketplace scrapes (worker job timeout). */
  signal?: AbortSignal;
};

export type RefreshItemPricesInput = {
  shelfType: string;
  shelfName?: string | null;
  primaryName: string;
  extraNames?: string[];
  acceptanceNames?: string[];
  extraBarcodes?: string[];
  platformKey?: string | null;
  releaseDate?: string | null;
  externalIds?: Record<string, string | null | undefined>;
  itemId: string;
  metadataId?: string | null;
  providerProductUrls?: readonly ProviderProductUrlRef[];
  /** Print identity for barcode-less TCG items. */
  printKey?: string | null;
  /** Abort in-flight marketplace scrapes (worker job timeout). */
  signal?: AbortSignal;
};

export type ShelfItemPriceFields = {
  priceNew: number | null;
  priceFoil?: number | null;
  priceUsed: number | null;
  priceUsedCIB: number | null;
  /** FX / catalog ~ fallback when native EUR buckets are empty. */
  priceEstimated?: number | null;
  /** FX ~ for foil when no native EUR foil (TCG). */
  priceEstimatedFoil?: number | null;
  priceLastUpdated: Date | null;
};

export type CacheSummaryFields = {
  priceNew: number | null;
  priceUsed: number | null;
  priceUsedCIB: number | null;
  priceLastUpdated: Date | null;
};
