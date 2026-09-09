/**
 * Soft-migrate a products-index: promote kinds + normalize langs without
 * changing slugs / keys. Safe to re-run.
 */
import { writeFileSync } from "node:fs";

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
  file: string,
  index: ProductsIndexV1,
): { changed: number } {
  const { index: next, changed } = rewriteSealedProductsIndex(index);
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return { changed };
}
