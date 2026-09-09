/**
 * Audit: card catalogue languages vs sealed SKU languages.
 *
 * Encodes the honest gap — we do **not** invent SKUs. Follow-up harvests
 * must close these holes with attested sources (see
 * `docs/sealed_sku_lang_coverage.md`).
 */
import { existsSync, readFileSync } from "node:fs";

import { packCardsIndexPath, packProductsIndexPath } from "@/lib/packPaths";
import { isCardsIndexV1 } from "@/effects/cardsIndex";
import {
  isProductsIndexV1,
  type ProductsIndexV1,
} from "@/providers/shared/sealedProducts/indexFormat";
import { normalizeSealedLang } from "@/providers/shared/sealedProducts/lang";

export type SealedLangCoverage = {
  pack: string;
  cardLangs: string[];
  skuLangs: string[];
  /** Card langs with zero sealed SKU in that lang. */
  missingSkuLangs: string[];
};

function measureCardLangs(pack: string): string[] {
  const file = packCardsIndexPath(pack);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!isCardsIndexV1(raw)) return [];
    const langs = new Set<string>();
    for (const entry of Object.values(raw.cards)) {
      for (const lang of Object.keys(entry.langs ?? {})) {
        const n = normalizeSealedLang(lang);
        if (n) langs.add(n);
      }
    }
    return [...langs].sort();
  } catch {
    return [];
  }
}

function measureSkuLangs(index: ProductsIndexV1): string[] {
  const langs = new Set<string>();
  for (const entry of Object.values(index.products)) {
    const n = normalizeSealedLang(entry.lang);
    if (n) langs.add(n);
  }
  return [...langs].sort();
}

export function sealedLangCoverageForPack(pack: string): SealedLangCoverage | null {
  const productsFile = packProductsIndexPath(pack);
  if (!existsSync(productsFile)) return null;
  try {
    const raw = JSON.parse(readFileSync(productsFile, "utf8")) as unknown;
    if (!isProductsIndexV1(raw)) return null;
    const cardLangs = measureCardLangs(pack);
    const skuLangs = measureSkuLangs(raw);
    const missingSkuLangs = cardLangs.filter((lang) => !skuLangs.includes(lang));
    return { pack, cardLangs, skuLangs, missingSkuLangs };
  } catch {
    return null;
  }
}

/** Packs that publish both cards-index and products-index. */
export const SEALED_LANG_COVERAGE_PACKS = [
  "lorcana",
  "pokemon",
  "dbs/cg",
  "dbs/fw",
  "onepiece",
  "naruto/carddass",
] as const;
