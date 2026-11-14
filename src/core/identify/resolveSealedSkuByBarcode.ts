/**
 * Catalogue GTIN → sealed skuKey. Collision (Bleach trap) stays doubt —
 * never a confident false sealed lock.
 */
import {
  lookupSealedProductKeysByBarcode,
  type SealedBarcodeHit,
} from "@/providers/shared/sealedProducts/productsSqlite";

export type SealedSkuSure = {
  confidence: "sure";
  productKey: string;
  packId: string;
};

export type SealedSkuDoubt = {
  confidence: "doubt";
  hits: SealedBarcodeHit[];
};

export type SealedSkuResolve = SealedSkuSure | SealedSkuDoubt;

/**
 * Resolve a retail barcode against the sealed catalogue.
 * - 0 hits → null
 * - 1 hit → sure { productKey, packId }
 * - 2+ hits → doubt list (shared GTIN / Bleach trap)
 */
export function resolveSealedSkuByBarcode(
  barcode: string,
  opts?: {
    packIds?: readonly string[];
    dbPathForPack?: (packId: string) => string;
  },
): SealedSkuResolve | null {
  const hits = lookupSealedProductKeysByBarcode(barcode, opts);
  if (!hits.length) return null;
  if (hits.length === 1) {
    const hit = hits[0]!;
    return {
      confidence: "sure",
      productKey: hit.productKey,
      packId: hit.packId,
    };
  }
  return { confidence: "doubt", hits };
}
