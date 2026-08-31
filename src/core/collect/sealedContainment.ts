/**
 * Index inverse élargi : print → produits scellés qui le **contiennent**
 * (liste garantie, pool listé, ou pool set).
 *
 * Distinct de {@link sealedSourcesByPrint} (buyAdvice) : celui-là ne garde que
 * les garanties pour le conseil d’achat. Ici on alimente la fiche carte
 * (« Inclus dans ») avec packshots — y compris boosters / displays du set.
 */

import type { ProductBehavior } from "./buyAdvice";

export type SealedContainmentRelation =
  | "guaranteed"
  | "listed_pool"
  | "set_pool";

export type SealedContainmentSource = {
  slug: string;
  name: string;
  kind: string;
  imageUrl?: string | null;
  relation: SealedContainmentRelation;
};

export type RandomPoolScope =
  | "set"
  | "listed"
  | "none"
  | "unknown";

/** Produit scellé tel que le loader check-list / fiche le publie. */
export type ContainmentProduct = {
  slug: string;
  name: string;
  kind: string;
  behavior: ProductBehavior | "no_cards";
  setId?: string | null;
  imageUrl?: string | null;
  /** `true` quand `guaranteedPrints` / preview ne sont pas le contenu réel. */
  printsArePreview?: boolean;
  /**
   * Tirages garantis (starter, promo gift…). Présents même si `behavior`
   * est `mixed_bundle`.
   */
  guaranteedPrints?: readonly string[] | null;
  /**
   * Sachets par set (coffret multi-séries). Un print du set S entre en
   * `set_pool` si `packsBySet[S] > 0`.
   */
  packsBySet?: Readonly<Record<string, number>> | null;
  randomPoolScope?: RandomPoolScope | null;
  randomPoolPrints?: readonly string[] | null;
};

const RELATION_RANK: Record<SealedContainmentRelation, number> = {
  guaranteed: 0,
  listed_pool: 1,
  set_pool: 2,
};

const KIND_RANK: Record<string, number> = {
  deck: 0,
  coffret: 1,
  booster: 2,
  display: 3,
};

function normKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function sameSet(
  productSetId: string | null | undefined,
  printSetId: string | null | undefined,
): boolean {
  const a = normKey(productSetId);
  const b = normKey(printSetId);
  return Boolean(a && b && a === b);
}

function kindRank(kind: string): number {
  return KIND_RANK[normKey(kind)] ?? 50;
}

function compareSources(
  a: SealedContainmentSource,
  b: SealedContainmentSource,
): number {
  const byRelation =
    RELATION_RANK[a.relation] - RELATION_RANK[b.relation];
  if (byRelation !== 0) return byRelation;
  const byKind = kindRank(a.kind) - kindRank(b.kind);
  if (byKind !== 0) return byKind;
  return a.name.localeCompare(b.name, "fr");
}

function asSource(
  product: ContainmentProduct,
  relation: SealedContainmentRelation,
): SealedContainmentSource {
  return {
    slug: product.slug,
    name: product.name,
    kind: product.kind,
    imageUrl: product.imageUrl ?? null,
    relation,
  };
}

function packsForSet(
  product: ContainmentProduct,
  setId: string | null | undefined,
): number {
  const sid = normKey(setId);
  if (!sid || !product.packsBySet) return 0;
  const direct = product.packsBySet[sid];
  if (typeof direct === "number" && direct > 0) return direct;
  for (const [key, packs] of Object.entries(product.packsBySet)) {
    if (normKey(key) === sid && packs > 0) return packs;
  }
  return 0;
}

/**
 * Produits scellés attestés pour un tirage, triés garanties → pool listé →
 * pool set, puis kind (deck avant booster avant display).
 */
export function sealedContainmentForPrint(input: {
  printKey: string;
  setId?: string | null;
  products: readonly ContainmentProduct[];
}): SealedContainmentSource[] {
  const printKey = normKey(input.printKey);
  if (!printKey) return [];

  const bySlug = new Map<string, SealedContainmentSource>();

  const prefer = (
    product: ContainmentProduct,
    relation: SealedContainmentRelation,
  ) => {
    const slug = product.slug.trim();
    if (!slug) return;
    const next = asSource(product, relation);
    const prev = bySlug.get(slug);
    if (!prev || RELATION_RANK[relation] < RELATION_RANK[prev.relation]) {
      bySlug.set(slug, next);
    }
  };

  for (const product of input.products) {
    if (product.behavior === "no_cards") continue;

    const guaranteed = (product.guaranteedPrints ?? [])
      .map(normKey)
      .filter(Boolean);
    const isBundle =
      product.behavior === "known_bundle" ||
      product.behavior === "mixed_bundle";

    if (
      isBundle &&
      !product.printsArePreview &&
      guaranteed.includes(printKey)
    ) {
      prefer(product, "guaranteed");
      continue;
    }

    const scope = product.randomPoolScope ?? "unknown";
    if (scope === "listed") {
      const listed = (product.randomPoolPrints ?? [])
        .map(normKey)
        .filter(Boolean);
      if (listed.includes(printKey)) {
        prefer(product, "listed_pool");
        continue;
      }
    }

    if (scope !== "set") continue;

    if (
      (product.behavior === "random_pack" ||
        product.behavior === "pack_container") &&
      sameSet(product.setId, input.setId)
    ) {
      prefer(product, "set_pool");
      continue;
    }

    /*
      Coffret multi-séries : la loterie d'un sachet S1 n'a pas de setId
      unique, mais `packsBySet.s1` atteste qu'un booster de ce set est dedans.
    */
    if (
      product.behavior === "mixed_bundle" &&
      packsForSet(product, input.setId) > 0
    ) {
      prefer(product, "set_pool");
    }
  }

  return [...bySlug.values()].sort(compareSources);
}
