import type { BarcodeLookupType } from "@/types/providerModule";
import type { Capability, MediaType } from "@/types/providerRegistry";

export type PrestashopSearchParam = "search_query" | "s";

/** Native PrestaShop AJAX (`products[]`) vs IQIT themes (`rendered_products` HTML). */
export type PrestashopSearchStrategy = "native" | "iqit";

export interface PrestashopRetailerConfig {
  id: string;
  label: string;
  baseUrl: string;
  searchPath: string;
  searchParam: PrestashopSearchParam;
  /** Defaults to native JSON `products`; IQIT shops expose hits in `rendered_products`. */
  searchStrategy?: PrestashopSearchStrategy;
  /** HTTP timeout for search/product-page fetches (ms). Defaults to 12000. */
  requestTimeoutMs?: number;
  /**
   * Media types this shop serves. The PrestaShop connector is type-agnostic — the
   * shop declares its own types instead of the factory assuming board games.
   */
  types: MediaType[];
  /** Barcode lookup branches it fires in. Defaults to its `types` + "generic". */
  barcodeTypes?: BarcodeLookupType[];
  /**
   * Capabilities this shop supplies. Defaults to the board-game-oriented set; a
   * shop serving another type declares its own (a games shop has no `players`).
   */
  capabilities?: Capability[];
  /** Representative product for the mapping probe. Defaults to a board game. */
  sample?: { name: string; barcode: string };
}

export interface PrestashopSearchProduct {
  id_product?: number;
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
