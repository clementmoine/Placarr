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
export { createPrestashopResolver, mapPrestashopMetadata } from "./resolver";

export const PRESTASHOP_RETAILER_MODULES = PRESTASHOP_RETAILER_CONFIGS.map(
  (config) => createPrestashopModule(config),
);

export const monsieurdemdl = PRESTASHOP_RETAILER_MODULES.find(
  (mdl) => mdl.info.id === "monsieurde",
)!;
export const ludifoliemdl = PRESTASHOP_RETAILER_MODULES.find(
  (mdl) => mdl.info.id === "ludifolie",
)!;
export const bcdjeuxmdl = PRESTASHOP_RETAILER_MODULES.find(
  (mdl) => mdl.info.id === "bcdjeux",
)!;
export const lepassetempsmdl = PRESTASHOP_RETAILER_MODULES.find(
  (mdl) => mdl.info.id === "lepassetemps",
)!;
