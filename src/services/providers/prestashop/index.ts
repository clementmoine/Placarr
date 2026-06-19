import { PRESTASHOP_RETAILER_CONFIGS } from "./configs";
import { createPrestashopModule } from "./moduleFactory";

export { PRESTASHOP_RETAILER_CONFIGS } from "./configs";
export {
  BCDJEUX_CONFIG,
  LEPASSETEMPS_CONFIG,
  LUDIFOLIE_CONFIG,
  MONSIEURDE_CONFIG,
} from "./configs";
export { mapPrestashopSearchProduct, searchPrestashopProduct } from "./fetch";
export {
  extractBarcodeFromProductUrl,
  extractEditionYearFromProductName,
  parseFrenchPriceCents,
  parsePrestashopShortDescription,
  pickPrestashopCoverUrl,
  stripHtml,
} from "./parse";
export { createPrestashopModule } from "./moduleFactory";
export {
  createPrestashopResolver,
  mapPrestashopMetadata,
} from "./resolver";

export const PRESTASHOP_RETAILER_MODULES = PRESTASHOP_RETAILER_CONFIGS.map(
  (config) => createPrestashopModule(config),
);

export const monsieurdeModule = PRESTASHOP_RETAILER_MODULES.find(
  (module) => module.info.id === "monsieurde",
)!;
export const ludifolieModule = PRESTASHOP_RETAILER_MODULES.find(
  (module) => module.info.id === "ludifolie",
)!;
export const bcdjeuxModule = PRESTASHOP_RETAILER_MODULES.find(
  (module) => module.info.id === "bcdjeux",
)!;
export const lepassetempsModule = PRESTASHOP_RETAILER_MODULES.find(
  (module) => module.info.id === "lepassetemps",
)!;
