/**
 * Audit: card catalogue languages vs sealed SKU languages.
 *
 * Encodes the honest gap — we do **not** invent SKUs. Follow-up harvests
 * must close these holes with attested sources (see
 * `docs/sealed_sku_lang_coverage.md`).
 */
import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { loadSealedProductsIndex } from "@/providers/shared/sealedProducts/persistProductsIndex";
import { normalizeSealedLang } from "@/providers/shared/sealedProducts/lang";
import type { ProductsIndexV1 } from "@/providers/shared/sealedProducts/indexFormat";

export type SealedLangCoverage = {
  pack: string;
  cardLangs: string[];
  skuLangs: string[];
  /** Card langs with zero sealed SKU in that lang. */
  missingSkuLangs: string[];
};

function measureCardLangs(pack: string): string[] {
  const langs = new Set<string>();
  const index = createLocalPrintsIndex(pack);
  if (!index.hasIdentityCorpus()) return [];
  for (const lang of ["fr", "en", "ja", "it", "de", "es"] as const) {
    if (index.listRowsForLanguage(lang).some((row) => row.fullName || row.art)) {
      const n = normalizeSealedLang(lang);
      if (n) langs.add(n);
    }
  }
  return [...langs].sort();
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
  try {
    const loaded = loadSealedProductsIndex(pack);
    if (Object.keys(loaded.products).length === 0) return null;
    const cardLangs = measureCardLangs(pack);
    const skuLangs = measureSkuLangs(loaded);
    const missingSkuLangs = cardLangs.filter((lang) => !skuLangs.includes(lang));
    return { pack, cardLangs, skuLangs, missingSkuLangs };
  } catch {
    return null;
  }
}

/** Packs that publish both card identity and sealed SKUs. */
export const SEALED_LANG_COVERAGE_PACKS = [
  "lorcana",
  "pokemon",
  "dragonball/cg",
  "dragonball/fw",
  "onepiece",
  "naruto/carddass",
] as const;
