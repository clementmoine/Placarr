import { SHOPIFY_RETAILER_CONFIGS } from "./configs";
import { createShopifyModule } from "./moduleFactory";

export { SHOPIFY_RETAILER_CONFIGS, LATELIERDESJEUX_CONFIG } from "./configs";
export {
  extractProductHandles,
  fetchShopifyBarcodeProduct,
  fetchShopifyProductByHandle,
  searchShopifyHits,
  searchShopifyProduct,
  stripHtml,
} from "./fetch";
export { createShopifyModule } from "./moduleFactory";
export { createShopifyResolver, mapShopifyMetadata } from "./resolver";

export const SHOPIFY_RETAILER_MODULES = SHOPIFY_RETAILER_CONFIGS.map((config) =>
  createShopifyModule(config),
);

export const latelierdesjeuxModule = SHOPIFY_RETAILER_MODULES.find(
  (mdl) => mdl.info.id === "latelierdesjeux",
)!;
