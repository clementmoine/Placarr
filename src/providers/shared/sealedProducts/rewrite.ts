/**
 * Soft-migrate a products-index: promote kinds, normalize langs, collapse
 * recto/verso duplicate SKUs. Safe to re-run.
 */
import { rewriteAssetPackUrl } from "@/lib/packAssetUrls";

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

function rewriteEntryAssetUrl(
  url: string | null | undefined,
): string | null {
  if (url == null) return null;
  const trimmed = url.trim();
  if (!trimmed) return url;
  return rewriteAssetPackUrl(trimmed);
}

/** Soft-repair latin-1→UTF-8 mojibake left in sealed names (`D�tecteur`). */
export function rewriteSealedProductName(
  name: string | null | undefined,
): string | null {
  if (name == null) return null;
  const trimmed = name.trim();
  if (!trimmed) return name;
  return trimmed
    .replace(/\uFFFD/g, "é")
    // Bandai FR packaging / Naruto Carddass : « Série N », pas dbzc « Part N ».
    .replace(/^Part (\d+|Promo)\b/u, "Série $1");
}

function normalizeSealedPairName(name: string | null | undefined): string {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[\s—–_-]+/g, " ")
    .trim();
}

/** Trailing host id (`part6-box-1510` → 1510) when present. */
export function sealedSlugHostId(slug: string): number | null {
  const match = /-(\d+)$/.exec(slug.trim());
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function sealedFacePairKey(entry: SealedProductEntry): string {
  const lang = resolveSealedLang({ lang: entry.lang, slug: entry.slug });
  return [
    (entry.setCode ?? "").trim().toLowerCase(),
    entry.kind,
    lang ?? "",
    normalizeSealedPairName(entry.name),
  ].join("\0");
}

function preferMergedSealedEntry(
  front: SealedProductEntry,
  back: SealedProductEntry,
): SealedProductEntry {
  const backImage = rewriteEntryAssetUrl(back.image);
  return {
    ...front,
    priceCents: front.priceCents ?? back.priceCents,
    cardsPerPack: front.cardsPerPack ?? back.cardsPerPack,
    packsContained: front.packsContained ?? back.packsContained,
    declaredCardCount: front.declaredCardCount ?? back.declaredCardCount,
    setCardCount: front.setCardCount ?? back.setCardCount,
    contentsKnown: front.contentsKnown || back.contentsKnown,
    imageBack:
      rewriteEntryAssetUrl(front.imageBack) ??
      (backImage && backImage !== rewriteEntryAssetUrl(front.image)
        ? backImage
        : null),
    poster:
      rewriteEntryAssetUrl(front.poster) ??
      rewriteEntryAssetUrl(back.poster),
    setLogo:
      rewriteEntryAssetUrl(front.setLogo) ??
      rewriteEntryAssetUrl(back.setLogo),
    guaranteedPrints:
      front.guaranteedPrints.length >= back.guaranteedPrints.length
        ? front.guaranteedPrints
        : back.guaranteedPrints,
    prints:
      front.prints.length >= back.prints.length ? front.prints : back.prints,
  };
}

/**
 * dbzcollection (et proches) publient souvent recto + verso comme deux SKU
 * au même libellé. Une paire → un produit, verso dans `imageBack`.
 */
export function mergeSealedFaceBackPairs(
  products: Record<string, SealedProductEntry>,
): number {
  const groups = new Map<string, string[]>();
  for (const [key, entry] of Object.entries(products)) {
    const name = normalizeSealedPairName(entry.name);
    if (!name) continue;
    const groupKey = sealedFacePairKey(entry);
    const list = groups.get(groupKey) ?? [];
    list.push(key);
    groups.set(groupKey, list);
  }

  let removed = 0;
  for (const keys of groups.values()) {
    if (keys.length !== 2) continue;
    const ranked = [...keys].sort((a, b) => {
      const ea = products[a]!;
      const eb = products[b]!;
      const idA = sealedSlugHostId(ea.slug);
      const idB = sealedSlugHostId(eb.slug);
      if (idA != null && idB != null && idA !== idB) return idA - idB;
      return ea.slug.localeCompare(eb.slug, "en");
    });
    const frontKey = ranked[0]!;
    const backKey = ranked[1]!;
    const front = products[frontKey]!;
    const back = products[backKey]!;
    // Already a proper face+back on one side — drop the lone duplicate face.
    if (front.imageBack && !back.imageBack) {
      delete products[backKey];
      removed += 1;
      continue;
    }
    if (back.imageBack && !front.imageBack) {
      products[frontKey] = preferMergedSealedEntry(back, front);
      delete products[backKey];
      removed += 1;
      continue;
    }
    if (!front.image?.trim() || !back.image?.trim()) continue;
    products[frontKey] = preferMergedSealedEntry(front, back);
    delete products[backKey];
    removed += 1;
  }
  return removed;
}

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
    name: rewriteSealedProductName(refined.name),
    image: rewriteEntryAssetUrl(refined.image),
    imageBack: rewriteEntryAssetUrl(refined.imageBack),
    poster: rewriteEntryAssetUrl(refined.poster),
    setLogo: rewriteEntryAssetUrl(refined.setLogo),
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
      next.lang !== entry.lang ||
      next.name !== entry.name ||
      next.image !== entry.image ||
      next.imageBack !== entry.imageBack ||
      next.poster !== entry.poster ||
      next.setLogo !== entry.setLogo
    ) {
      changed += 1;
    }
    // Keep the existing product key — only fields migrate.
    products[key] = next;
  }
  changed += mergeSealedFaceBackPairs(products);
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
