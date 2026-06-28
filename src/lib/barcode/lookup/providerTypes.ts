/** Barcode lookup payload shapes shared across core and provider modules. */

export interface PriceChartingPrices {
  priceUsed?: number;
  priceUsedCIB?: number;
  priceNew?: number;
}

export interface PriceChartingMetadata {
  title: string;
  platform?: string;
  coverUrl?: string;
  /** Product photos from the #images section, at max resolution (1600px). */
  images?: PriceChartingImage[];
  ageRating?: string;
  barcode?: string;
  /** Parsed from the same detail page as metadata (single network call). */
  prices?: PriceChartingPrices;
}

export interface PriceChartingImage {
  url: string;
  label?: string;
}

export interface LeDenicheurPrices {
  priceNew?: number;
  /** Lowest used/alternative-condition price when it differs from `priceNew`. */
  priceUsed?: number;
  sourceUrl?: string;
  productName?: string;
  merchantName?: string;
  offerCount?: number;
  coverUrl?: string | null;
  matchedQuery?: string;
}
