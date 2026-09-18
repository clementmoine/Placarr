/**
 * Soft-migrate a products-index: promote kinds + normalize langs without
 * changing slugs / keys. Safe to re-run.
 */
import {
  type ProductsIndexV1,
  type SealedProductEntry,
} from "./indexFormat";
import {
  refineSealedKind,
  sealedBehaviorForKind,
  withRefinedSealedKind,
} from "./kinds";
import { resolveSealedLang } from "./lang";
import { backfillSealedProductPackshots } from "./packshotUrl";
import { persistSealedProductsIndexDoc } from "./persistProductsIndex";

export function rewriteSealedProductEntry(
  entry: SealedProductEntry,
): SealedProductEntry {
  const refined = withRefinedSealedKind(entry);
  const lang = resolveSealedLang({
    lang: refined.lang,
    slug: refined.slug,
  });
  const kind =
    refineSealedKind({
      category: refined.category,
      slug: refined.slug,
      name: refined.name,
      kind: refined.kind,
    }) ?? refined.kind;
  return {
    ...refined,
    kind,
    behavior: sealedBehaviorForKind(kind),
    lang,
  };
}

export function rewriteSealedProductsIndex(
  index: ProductsIndexV1,
): { index: ProductsIndexV1; changed: number } {
  const products: Record<string, SealedProductEntry> = {};
  let changed = 0;
  for (const [key, entry] of Object.entries(index.products)) {
    const next = rewriteSealedProductEntry(entry);
    if (
      next.kind !== entry.kind ||
      next.behavior !== entry.behavior ||
      next.lang !== entry.lang
    ) {
      changed += 1;
    }
    // Keep the existing product key — only fields migrate.
    products[key] = next;
  }
  changed += backfillSealedProductPackshots(index.pack, products);
  return {
    index: {
      ...index,
      generatedAt: new Date().toISOString(),
      products,
    },
    changed,
  };
}

export function writeRewrittenSealedProductsIndex(
  packId: string,
  index: ProductsIndexV1,
): { changed: number; file: string } {
  const { index: next, changed } = rewriteSealedProductsIndex(index);
  const { file } = persistSealedProductsIndexDoc({ ...next, pack: packId });
  return { changed, file };
}
