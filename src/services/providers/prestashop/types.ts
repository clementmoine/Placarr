export type PrestashopSearchParam = "search_query" | "s";

export interface PrestashopRetailerConfig {
  id: string;
  label: string;
  baseUrl: string;
  searchPath: string;
  searchParam: PrestashopSearchParam;
}

export interface PrestashopSearchProduct {
  name?: string;
  price?: string;
  price_amount?: number;
  link?: string;
  manufacturer_name?: string;
  description_short?: string;
  ean13?: string;
  reference?: string;
  cover?: {
    bySize?: Record<string, { url?: string }>;
    large?: { url?: string };
  };
}

export interface PrestashopProduct {
  title: string;
  description?: string;
  imageUrl?: string;
  barcode?: string;
  reference?: string;
  manufacturer?: string;
  priceCents?: number;
  players?: string;
  playtime?: string;
  ageRating?: string;
  productUrl: string;
  source: string;
  releaseDate?: string;
}
