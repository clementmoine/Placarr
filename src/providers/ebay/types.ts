export interface EbayProduct {
  name: string;
  coverUrl?: string | null;
  /** eBay catalog product id when the hit comes from the Catalog API. */
  epid?: string;
  brand?: string | null;
  /** Canonical catalog product vs noisy marketplace listing title. */
  catalog?: boolean;
}

export interface EbayPrices {
  priceNew?: number;
  priceUsed?: number;
  sourceUrl?: string;
  productName?: string;
  offerCount?: number;
}
