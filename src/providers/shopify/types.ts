import type { BarcodeLookupType } from "@/types/providerModule";
import type { Capability, MediaType } from "@/types/providerRegistry";

/**
 * A Shopify storefront. Unlike PrestaShop, Shopify exposes the same standard
 * endpoints on every shop, so a config only needs the domain — the connector
 * knows how to search and fetch a product.
 */
export interface ShopifyRetailerConfig {
  id: string;
  label: string;
  /** Storefront origin, e.g. "https://latelierdesjeux.com" (no trailing slash). */
  baseUrl: string;
  /** Media types this shop serves (the shop declares them, not the factory). */
  types: MediaType[];
  /** Barcode lookup branches it fires in. Defaults to its `types` + "generic". */
  barcodeTypes?: BarcodeLookupType[];
  /** Capabilities this shop supplies. Defaults to the board-game-oriented set. */
  capabilities?: Capability[];
  /** Representative product for the mapping probe. */
  sample?: { name: string; barcode: string };
}

export interface ShopifyProduct {
  title: string;
  description?: string;
  imageUrl?: string;
  galleryImages: string[];
  barcode?: string;
  /** Shopify `vendor` — for board games this is the publisher. */
  manufacturer?: string;
  priceCents?: number;
  productUrl: string;
  source: string;
}
