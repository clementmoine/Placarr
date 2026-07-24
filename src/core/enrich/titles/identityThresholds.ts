/**
 * Identity similarity floors shared by merge, catalog URL align, and retailers.
 * Keep this module dependency-free (imported by titleMatching ↔ titleMatch).
 */

/** Standard floor for merge / catalog URL / name-only retailer. */
export const METADATA_TITLE_ALIGN_FLOOR = 0.58;

/** Soft floor only when a barcode already confirmed the product SKU. */
export const BARCODE_CONFIRMED_TITLE_FLOOR = 0.42;
