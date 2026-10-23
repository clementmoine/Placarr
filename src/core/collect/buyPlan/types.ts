/**
 * Conseil d'achat — modèle de données.
 *
 * Trois voies vers 100 % d'une check-list :
 *  - **singles** : tout à l'unité ;
 *  - **sealed** : loterie seule — le panier scellé le plus efficace
 *    (cartes neuves espérées / €), arrêté quand un sachet de plus rapporte
 *    moins de `stopRule.minNewCardsPerPack` ;
 *  - **mixed** : ce même panier, puis ce qu'il laisse au hasard acheté à
 *    l'unité (E[reste] × cote). Son total se compare aux singles.
 * La recommandation = la moins chère des voies 100 % (singles / mixte).
 *
 * Tout est en centimes, espérances exactes (pas de seuils par rareté).
 */

export type TargetMode = "base-set" | "master-set";

export type Provenance = "official" | "community" | "structural" | "unknown";

/**
 * Un trou = une carte (ou carte×finition) à obtenir `requiredCopies` fois.
 * `acceptedPrints` : les printKeys qui satisfont ce trou (base-set : une
 * seule clé ; une future classe d'équivalence pourrait en lister plusieurs).
 */
export type Requirement = {
  id: string;
  acceptedPrints: readonly string[];
  requiredCopies: number;
  ownedCopies: number;
  /** Cote unitaire (meilleure offre). `null` = inconnue. */
  priceCents: number | null;
  /** `priceCents` est une estimation (médiane de rareté), pas une cote. */
  priceImputed?: boolean;
  rarity?: string | null;
};

/**
 * SKU scellé normalisé : une partie **garantie** (decks, promos) et une
 * partie **loterie** (`packs` sachets, chacun avec `packHitByPrint`).
 * Un coffret cadeau = promo garantie + 5 sachets ; un starter = garanti seul ;
 * un booster = 1 sachet.
 */
export type SealedSku = {
  slug: string;
  name: string;
  priceCents: number | null;
  imageUrl?: string | null;
  /** Tirages garantis — une entrée par copie physique. */
  guaranteed: readonly string[];
  /** La liste garantie est incomplète (le listé reste garanti). */
  guaranteedPartial: boolean;
  /** Sachets loterie par unité (0 = aucun). */
  packs: number;
  /**
   * p_x = P(≥ 1 copie de x dans UN sachet), par printKey (canonique lower).
   * `null` avec `packs > 0` = taux inconnus : la loterie n'est pas chiffrée.
   */
  packHitByPrint: ReadonlyMap<string, number> | null;
  provenance: Provenance;
};

export type PlanFlag =
  /** Au moins un trou sans cote ni estimation — exclu du coût singles. */
  | "partialPrices"
  /** Des cotes manquantes ont été estimées par médiane de rareté. */
  | "imputedPrices"
  /** Un SKU à loterie n'a pas de taux → ignoré pour sa partie sachet. */
  | "unknownRates"
  /** Taux community / structurels (pas officiels) utilisés. */
  | "lowConfidenceRates"
  /** Sachets supposés indépendants (pas de garantie par boîte). */
  | "independenceAssumed";

export type PlanItem = {
  slug: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  /** E[cartes de la check-list apportées par ces unités] (marginal). */
  expectedNewCards: number;
  imageUrl?: string | null;
};

export type SinglesLine = {
  requirementId: string;
  priceCents: number;
  priceImputed: boolean;
  /** P(il faudra encore l'acheter) après le scellé de la voie. */
  probabilityNeeded: number;
  /** priceCents × E[copies encore manquantes]. */
  expectedCostCents: number;
};

export type SinglesTrack = {
  totalCents: number;
  lines: SinglesLine[];
  pricedCount: number;
  imputedCount: number;
  unpricedCount: number;
};

/**
 * Mixte : le panier scellé **efficace** (cartes neuves / €, arrêté à
 * `stopRule`), puis ce qu'il laisse au hasard acheté à l'unité.
 */
export type MixedTrack = {
  items: PlanItem[];
  sealedCents: number;
  /** Σ cote × E[copies encore manquantes] après ce scellé. */
  singlesCents: number;
  /** sealedCents + singlesCents. */
  totalCents: number;
  /** E[cartes obtenues via le scellé]. */
  expectedCardsFromSealed: number;
  /** expectedCardsFromSealed / copiesNeeded (0..1). */
  expectedCompletion: number;
  /** E[cartes à acheter ensuite à l'unité]. */
  expectedRemainingCards: number;
  singles: SinglesLine[];
  /** Règle d'arrêt appliquée (cartes neuves espérées par sachet). */
  stopRule: { minNewCardsPerPack: number };
};

/**
 * Scellé : ce qu'il faut payer pour **espérer tout avoir**
 * (E[reste] ≤ `target`), SKUs optimisés — bundles garantis pour ce que la
 * loterie n'atteint pas, sachets consolidés en boîtes.
 */
export type SealedTrack = {
  items: PlanItem[];
  sealedCents: number;
  /** Sachets loterie dans le plan (après consolidation). */
  packs: number;
  /** E[cartes encore manquantes] après ce plan (sur les atteignables). */
  expectedRemainingCards: number;
  /** Trous qu'aucun SKU ne peut fournir (ni taux, ni garantie). */
  unreachableHoles: number;
  /** Borne de calcul atteinte : le plan est tronqué, le prix sous-estimé. */
  capped: boolean;
  /** Aucun SKU scellé exploitable. */
  indeterminate: boolean;
  target: { maxExpectedRemainingCards: number };
};

export type RecommendationReason =
  | "complete"
  | "mixed_saves"
  | "singles_cheapest"
  | "sealed_completes"
  | "no_prices";

export type Recommendation = {
  track: "singles" | "mixed" | "sealed";
  reason: RecommendationReason;
  /** Économie de la voie conseillée vs tout singles (≥ 0). */
  savingsCents: number;
  /**
   * `low` quand la majorité des cotes est estimée ou absente : le chiffre
   * reste affiché, mais pas comme un conseil ferme.
   */
  confidence: "high" | "low";
};

/** Métriques d'une unité de SKU achetée seule, depuis l'état courant. */
export type SkuMetrics = {
  slug: string;
  name: string;
  priceCents: number | null;
  expectedNewCards: number;
  /** Baisse de E[coût singles] apportée par une unité. */
  replacementValueCents: number;
  netGainCents: number;
  roi: number;
  centsPerNewCard: number | null;
  imageUrl?: string | null;
  /** Pas chiffrable (prix ou taux manquants). */
  indeterminate: boolean;
};

export type CompletionPlan = {
  mode: TargetMode;
  /** Trous ouverts. */
  holes: number;
  /** Σ copies manquantes. */
  copiesNeeded: number;
  singles: SinglesTrack;
  mixed: MixedTrack;
  sealed: SealedTrack;
  recommendation: Recommendation;
  skuMetrics: SkuMetrics[];
  flags: PlanFlag[];
};
