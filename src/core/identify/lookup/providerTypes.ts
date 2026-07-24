/** Barcode lookup payload shapes shared across core and provider modules. */

export interface PriceChartingPrices {
  priceUsed?: number;
  priceUsedCIB?: number;
  priceNew?: number;
  /** Verified `/game/…` detail URL when the scrape landed on a real page. */
  sourceUrl?: string;
  /** Catalog title from the detail page (or URL slug) for offer alignment. */
  productName?: string;
}

export interface PriceChartingMetadata {
  title: string;
  platform?: string;
  coverUrl?: string;
  /** Product photos from the #images section, at max resolution (1600px). */
  images?: PriceChartingImage[];
  ageRating?: string;
  barcode?: string;
  /** Verified PriceCharting `/game/…` URL for this product (prefers PAL/EUR). */
  url?: string;
  /**
   * PAL↔NTSC sibling fiche when both regions exist for the same catalog slug
   * (e.g. `/game/gamecube/…` when `url` is `/game/pal-gamecube/…`).
   */
  siblingUrl?: string;
  /** Parsed from the same detail page as metadata (single network call). */
  prices?: PriceChartingPrices;
}

export interface PriceChartingImage {
  url: string;
  label?: string;
  /** Region of the PriceCharting fiche this photo came from. */
  isPal?: boolean;
}

export interface LeDenicheurPrices {
  priceNew?: number;
  /** Lowest used/alternative-condition price when it differs from `priceNew`. */
  priceUsed?: number;
  sourceUrl?: string;
  productName?: string;
  productGtin?: string;
  merchantName?: string;
  offerCount?: number;
  coverUrl?: string | null;
  matchedQuery?: string;
}

/**
 * Collector-catalog barcode hit (structural). Provider modules may use a richer
 * typed shape; lookup assembly only needs title + optional platform.
 */
export interface CollectorCatalogBarcodeHit {
  title: string;
  platform?: string | null;
  [key: string]: unknown;
}
