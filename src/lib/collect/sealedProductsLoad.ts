/**
 * Charge les produits scellés d'un dataPack pour le conseil d’achat et
 * « Inclus dans ».
 *
 * Lecture via {@link loadSealedProductsIndex} (sqlite puis JSON fallback) ;
 * deux projections ({@link BuyProduct} vs {@link ContainmentProduct}).
 */
import {
  withContainerPackSizes,
  type BuyProduct,
  type ProductBehavior,
} from "@/core/collect/buyAdvice";
import type {
  ContainmentProduct,
} from "@/core/collect/sealedContainment";
import type {
  SealedProductEntry,
  SealedPrintLink,
} from "@/providers/shared/sealedProducts/indexFormat";
import {
  sealedBehaviorForKind,
  withRefinedSealedKind,
} from "@/providers/shared/sealedProducts/kinds";
import { loadSealedProductsIndex } from "@/providers/shared/sealedProducts/persistProductsIndex";

function printKeys(links: readonly SealedPrintLink[]): string[] {
  return links
    .map((row) => row.printKey)
    .filter((key): key is string => Boolean(key));
}

function sealedEntryRank(
  key: string,
  entry: Pick<SealedProductEntry, "image" | "contentsKnown" | "guaranteedPrints">,
): number {
  let score = 0;
  /*
    Après merge EN→Carddass, l'index peut garder `naruto/en-ccg::display-s24`
    **et** `naruto/carddass::display-s24` (même slug). Le conseil d'achat
    listait alors deux fois le display — clé React dupliquée.
  */
  if (key.includes("/carddass::")) score += 100;
  if (key.includes("/en-ccg::")) score -= 50;
  if (entry.image) score += 10;
  if (entry.contentsKnown) score += 5;
  if ((entry.guaranteedPrints?.length ?? 0) > 0) score += 3;
  return score;
}

/** Une entrée par slug — garde la plus informative / canonique. */
export function dedupeSealedEntriesBySlug(
  entries: Readonly<Record<string, SealedProductEntry>>,
): SealedProductEntry[] {
  const best = new Map<
    string,
    { key: string; entry: SealedProductEntry; rank: number }
  >();
  for (const [key, entry] of Object.entries(entries)) {
    const slug = entry.slug.trim();
    if (!slug) continue;
    const rank = sealedEntryRank(key, entry);
    const prev = best.get(slug);
    if (!prev || rank > prev.rank) best.set(slug, { key, entry, rank });
  }
  return [...best.values()].map((row) => row.entry);
}

/** Entrées mergées (index sqlite / JSON fallback + curated sealed-contents). */
export function loadSealedProductEntries(
  pack: string | null | undefined,
): SealedProductEntry[] {
  if (!pack) return [];
  try {
    const index = loadSealedProductsIndex(pack);
    const refined: Record<string, SealedProductEntry> = {};
    for (const [key, entry] of Object.entries(index.products)) {
      refined[key] = withRefinedSealedKind({
        ...entry,
        behavior: entry.behavior ?? sealedBehaviorForKind(entry.kind),
      });
    }
    return dedupeSealedEntriesBySlug(refined);
  } catch {
    return [];
  }
}

export function toBuyProduct(entry: SealedProductEntry): BuyProduct {
  const guaranteed = printKeys(entry.guaranteedPrints);
  const preview = printKeys(entry.prints);
  const known = guaranteed.length > 0;
  const randomPoolScope = entry.randomPoolScope ?? "unknown";
  const randomPoolPrints = printKeys(entry.randomPoolPrints);
  return {
    slug: entry.slug,
    name: (entry.name ?? "").trim() || entry.slug.replace(/-/g, " "),
    kind: entry.kind,
    behavior: entry.behavior as ProductBehavior,
    setId: entry.catalogueSetId ?? entry.setCode,
    prints: known ? guaranteed : preview,
    printsArePreview: known ? false : entry.containsPrintsIsPreview,
    cardCount: entry.declaredCardCount,
    packSize: entry.cardsPerPack,
    packsInContainer: entry.packsContained,
    packsBySet: entry.packsBySet ?? null,
    guaranteeSets: entry.guaranteeSets ?? null,
    priceCents: entry.priceCents,
    imageUrl: entry.image,
    language: entry.lang,
    contentsKnown: entry.contentsKnown,
    randomPoolScope,
    randomPoolPrints:
      randomPoolScope === "listed" && randomPoolPrints.length > 0
        ? randomPoolPrints
        : null,
  };
}

export function toContainmentProduct(
  entry: SealedProductEntry,
): ContainmentProduct {
  const guaranteed = printKeys(entry.guaranteedPrints);
  return {
    slug: entry.slug,
    name: (entry.name ?? "").trim() || entry.slug.replace(/-/g, " "),
    kind: entry.kind,
    behavior: entry.behavior as ContainmentProduct["behavior"],
    setId: entry.catalogueSetId ?? entry.setCode,
    imageUrl: entry.image,
    language: entry.lang,
    guaranteedPrints: guaranteed,
    packsBySet: entry.packsBySet ?? null,
    printsArePreview:
      guaranteed.length > 0 ? false : entry.containsPrintsIsPreview,
    randomPoolScope: entry.randomPoolScope ?? "unknown",
    randomPoolPrints: printKeys(entry.randomPoolPrints),
  };
}

/** Projection buyAdvice (garanties / preview comme avant). */
export function loadBuyProducts(
  pack: string | null | undefined,
): BuyProduct[] {
  return withContainerPackSizes(
    loadSealedProductEntries(pack).map(toBuyProduct),
  );
}

/** Projection « Inclus dans » (garanties + pools). */
export function loadContainmentProducts(
  pack: string | null | undefined,
): ContainmentProduct[] {
  return loadSealedProductEntries(pack).map(toContainmentProduct);
}
