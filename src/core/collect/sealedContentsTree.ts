/**
 * Contenu scellé = arbre imbriqué (tous TCGs).
 *
 * Nœuds : cartes fixes, tirages aléatoires, unités taille connue (sans liste),
 * SKUs enfants. Les `behavior` plats sont des raccourcis.
 */

export type TreeRandomPoolScope = "set" | "listed" | "none" | "unknown";

export type SealedContentFixedPrint = {
  printKey: string;
  qty?: number;
};

export type SealedContentNode =
  | { kind: "fixed"; prints: SealedContentFixedPrint[] }
  | {
      kind: "random";
      packs: number;
      cardsPerPack: number;
      pool: TreeRandomPoolScope;
      listed?: string[];
      /** Extension cible quand `packsBySet` a produit ce nœud. */
      setId?: string;
    }
  /** Deck / reward pack : N × K cartes, listes absentes. */
  | { kind: "units"; label: string; count: number; cardsEach: number }
  | { kind: "sku"; slug: string; qty: number };

export type SealedContentsTree = SealedContentNode[];

/**
 * Source plate (entry index / BuyProduct) — pas de dépendance providers.
 */
export type SealedContentsSource = {
  kind?: string;
  behavior?: string;
  contentsKnown?: boolean;
  printsArePreview?: boolean;
  /** PrintKeys déjà projetés (BuyProduct.prints). */
  printKeys?: readonly string[] | null;
  /** Liens riches (entry.guaranteedPrints). */
  guaranteedPrints?: readonly {
    printKey: string | null;
    qty?: number;
  }[] | null;
  cardCount?: number | null;
  cardsPerPack?: number | null;
  packsContained?: number | null;
  packsBySet?: Readonly<Record<string, number>> | null;
  randomPoolScope?: TreeRandomPoolScope | null;
  randomPoolPrints?: readonly string[] | null;
  guaranteedProducts?: readonly { slug: string; qty?: number }[] | null;
  structureUnits?: readonly {
    label: string;
    count: number;
    cardsEach: number;
  }[] | null;
};

export function toContentsTree(source: SealedContentsSource): SealedContentsTree {
  const tree: SealedContentsTree = [];

  for (const link of source.guaranteedProducts ?? []) {
    const slug = link.slug?.trim();
    if (!slug) continue;
    const qty =
      typeof link.qty === "number" && link.qty > 0 ? Math.floor(link.qty) : 1;
    tree.push({ kind: "sku", slug, qty });
  }

  for (const unit of source.structureUnits ?? []) {
    const label = unit.label?.trim();
    if (!label || !(unit.count > 0) || !(unit.cardsEach > 0)) continue;
    tree.push({
      kind: "units",
      label,
      count: Math.floor(unit.count),
      cardsEach: Math.floor(unit.cardsEach),
    });
  }

  const fixedPrints = collectFixedPrints(source);
  if (fixedPrints.length > 0) {
    tree.push({ kind: "fixed", prints: fixedPrints });
  }

  for (const node of collectRandomNodes(source)) {
    tree.push(node);
  }

  return tree;
}

function collectFixedPrints(
  source: SealedContentsSource,
): SealedContentFixedPrint[] {
  const fromGuaranteed: SealedContentFixedPrint[] = [];
  for (const row of source.guaranteedPrints ?? []) {
    const key = row.printKey?.trim();
    if (!key) continue;
    fromGuaranteed.push({
      printKey: key,
      ...(row.qty != null && row.qty > 0 ? { qty: Math.floor(row.qty) } : {}),
    });
  }
  if (fromGuaranteed.length > 0) return fromGuaranteed;

  /*
    Aperçu boutique : seulement un plancher honnête sur `known_bundle`
    (inventaire partiel de deck). Sinon ignorer.
  */
  const allowPreviewFloor =
    source.behavior === "known_bundle" && Boolean(source.printsArePreview);
  const keys = (source.printKeys ?? [])
    .map((key) => key.trim())
    .filter(Boolean);
  if (keys.length === 0) return [];
  if (source.printsArePreview && !allowPreviewFloor) return [];
  if (allowPreviewFloor || source.behavior === "known_bundle") {
    return keys.map((printKey) => ({ printKey }));
  }
  return [];
}

function collectRandomNodes(
  source: SealedContentsSource,
): Extract<SealedContentNode, { kind: "random" }>[] {
  const cardsPerPack =
    typeof source.cardsPerPack === "number" && source.cardsPerPack > 0
      ? source.cardsPerPack
      : 0;
  const pool = source.randomPoolScope ?? "unknown";

  if (pool === "listed") {
    const listed = (source.randomPoolPrints ?? [])
      .map((key) => key.trim())
      .filter(Boolean);
    const draws =
      typeof source.cardCount === "number" && source.cardCount > 0
        ? source.cardCount
        : 1;
    if (listed.length === 0) return [];
    return [
      {
        kind: "random",
        packs: draws,
        cardsPerPack: 1,
        pool: "listed",
        listed,
      },
    ];
  }

  const bySet = source.packsBySet;
  if (bySet && Object.keys(bySet).length > 0) {
    if (cardsPerPack <= 0) return [];
    const nodes: Extract<SealedContentNode, { kind: "random" }>[] = [];
    for (const [setId, packs] of Object.entries(bySet)) {
      if (!(packs > 0)) continue;
      nodes.push({
        kind: "random",
        packs: Math.floor(packs),
        cardsPerPack,
        pool: pool === "none" ? "set" : pool,
        setId: setId.trim() || undefined,
      });
    }
    return nodes;
  }

  if (cardsPerPack <= 0) return [];

  let packs: number | null = null;
  if (
    typeof source.packsContained === "number" &&
    source.packsContained > 0
  ) {
    packs = Math.floor(source.packsContained);
  } else if (
    source.behavior === "random_pack" ||
    source.kind === "booster"
  ) {
    packs = 1;
  }

  if (packs == null || packs <= 0) return [];
  return [
    {
      kind: "random",
      packs,
      cardsPerPack,
      pool: pool === "none" ? "set" : pool,
    },
  ];
}

/** BuyProduct → source plate pour {@link toContentsTree}. */
export function buyProductToContentsSource(product: {
  kind?: string;
  behavior?: string;
  contentsKnown?: boolean;
  printsArePreview?: boolean;
  prints?: readonly string[] | null;
  cardCount?: number | null;
  packSize?: number | null;
  packsInContainer?: number | null;
  packsBySet?: Readonly<Record<string, number>> | null;
  randomPoolScope?: TreeRandomPoolScope | null;
  randomPoolPrints?: readonly string[] | null;
  guaranteedProducts?: readonly { slug: string; qty?: number }[] | null;
  structureUnits?: readonly {
    label: string;
    count: number;
    cardsEach: number;
  }[] | null;
}): SealedContentsSource {
  return {
    kind: product.kind,
    behavior: product.behavior,
    contentsKnown: product.contentsKnown,
    printsArePreview: product.printsArePreview,
    printKeys: product.prints,
    cardCount: product.cardCount,
    cardsPerPack: product.packSize,
    packsContained: product.packsInContainer,
    packsBySet: product.packsBySet,
    randomPoolScope: product.randomPoolScope,
    randomPoolPrints: product.randomPoolPrints,
    guaranteedProducts: product.guaranteedProducts,
    structureUnits: product.structureUnits,
  };
}
