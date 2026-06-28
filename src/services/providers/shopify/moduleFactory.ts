import { createScrapeCatalogModule } from "@/services/providers/shared/scrapeCatalogModuleFactory";

import { fetchShopifyBarcodeProduct, searchShopifyProduct } from "./fetch";
import { createShopifyResolver } from "./resolver";
import type { ShopifyRetailerConfig } from "./types";

export const createShopifyModule = createScrapeCatalogModule<ShopifyRetailerConfig>({
  platformLabel: "Shopify",
  defaultCapabilities: [
    "identify",
    "description",
    "cover",
    "price",
    "people",
    "releaseDate",
  ],
  defaultSample: {
    name: "Mille Sabords",
    barcode: "3421272109517",
  },
  createResolver: createShopifyResolver,
  searchProduct: (config, name, barcode) =>
    searchShopifyProduct(config, name, barcode),
  fetchBarcodeProduct: fetchShopifyBarcodeProduct,
});
