import { HitTable, PlanState, evaluatePlan } from "./expectation";
import {
  isUsableSku,
  optimizeSealed,
  planToCompleteInExpectation,
  prepareCandidates,
  SEALED_COMPLETE_TARGET_REMAINING,
  SEALED_DEFAULT_MIN_NEW_CARDS_PER_PACK,
} from "./optimize";
import type {
  CompletionPlan,
  MixedTrack,
  PlanFlag,
  PlanItem,
  Recommendation,
  Requirement,
  SealedSku,
  SealedTrack,
  SinglesLine,
  SinglesTrack,
  SkuMetrics,
  TargetMode,
} from "./types";

/** Économie minimale pour conseiller le mixte : max(1 €, 1 % des singles). */
const MIXED_MIN_SAVINGS_CENTS = 100;
const MIXED_MIN_SAVINGS_RATIO = 0.01;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function missingCopies(req: Requirement): number {
  return Math.max(0, req.requiredCopies - req.ownedCopies);
}

function singlesLines(
  table: HitTable,
  quantities: ReadonlyMap<string, number>,
): SinglesLine[] {
  const e = evaluatePlan(table, quantities);
  const lines: SinglesLine[] = [];
  table.holes.forEach((hole, x) => {
    if (hole.priceCents == null) return;
    const outcome = e.holes[x]!;
    if (outcome.expectedRemaining <= 1e-9) return;
    lines.push({
      requirementId: hole.id,
      priceCents: hole.priceCents,
      priceImputed: hole.priceImputed === true,
      probabilityNeeded: outcome.probabilityNeeded,
      expectedCostCents: Math.round(
        hole.priceCents * outcome.expectedRemaining,
      ),
    });
  });
  return lines.sort((a, b) => b.expectedCostCents - a.expectedCostCents);
}

/**
 * Items d'un plan avec leur apport marginal (retrait de la ligne → Δcartes).
 */
function planItems(
  table: HitTable,
  quantities: ReadonlyMap<string, number>,
): PlanItem[] {
  const full = evaluatePlan(table, quantities);
  const items: PlanItem[] = [];
  for (const [slug, quantity] of quantities) {
    if (quantity <= 0) continue;
    const j = table.indexOf(slug);
    if (j < 0) continue;
    const sku = table.skus[j]!;
    const without = new Map(quantities);
    without.delete(slug);
    const partial = evaluatePlan(table, without);
    items.push({
      slug,
      name: sku.name,
      quantity,
      unitPriceCents: sku.priceCents ?? 0,
      expectedNewCards: round1(
        Math.max(0, full.expectedCards - partial.expectedCards),
      ),
      imageUrl: sku.imageUrl ?? null,
    });
  }
  return items.sort(
    (a, b) => b.quantity * b.unitPriceCents - a.quantity * a.unitPriceCents,
  );
}

function skuMetrics(
  table: HitTable,
  allSkus: readonly SealedSku[],
): SkuMetrics[] {
  const state = new PlanState(table);
  const rows: SkuMetrics[] = [];
  for (const sku of allSkus) {
    const j = table.indexOf(sku.slug);
    if (j < 0 || !isUsableSku(sku) || sku.priceCents == null) {
      rows.push({
        slug: sku.slug,
        name: sku.name,
        priceCents: sku.priceCents ?? null,
        expectedNewCards: 0,
        replacementValueCents: 0,
        netGainCents: 0,
        roi: 0,
        centsPerNewCard: null,
        imageUrl: sku.imageUrl ?? null,
        indeterminate: true,
      });
      continue;
    }
    const { singlesDropCents, newCards } = state.marginal(j);
    const net = singlesDropCents - sku.priceCents;
    rows.push({
      slug: sku.slug,
      name: sku.name,
      priceCents: sku.priceCents,
      expectedNewCards: round1(newCards),
      replacementValueCents: Math.round(singlesDropCents),
      netGainCents: Math.round(net),
      roi: net / sku.priceCents,
      centsPerNewCard:
        newCards > 1e-9 ? Math.round(sku.priceCents / newCards) : null,
      imageUrl: sku.imageUrl ?? null,
      indeterminate: false,
    });
  }
  return rows.sort((a, b) => {
    if (a.indeterminate !== b.indeterminate) return a.indeterminate ? 1 : -1;
    return b.roi - a.roi;
  });
}

function recommend(input: {
  holes: number;
  singles: SinglesTrack;
  mixed: MixedTrack;
  sealed: SealedTrack;
}): Recommendation {
  const { singles, mixed, sealed } = input;
  const realPriced = singles.pricedCount - singles.imputedCount;
  const confidence: Recommendation["confidence"] =
    realPriced > singles.imputedCount + singles.unpricedCount ? "high" : "low";
  if (input.holes === 0) {
    return {
      track: "singles",
      reason: "complete",
      savingsCents: 0,
      confidence: "high",
    };
  }
  /* Le plan scellé complète vraiment : pas tronqué, pas de trou hors d'atteinte. */
  const sealedCompletes =
    !sealed.indeterminate &&
    !sealed.capped &&
    sealed.unreachableHoles === 0 &&
    sealed.sealedCents > 0;
  if (singles.pricedCount === 0) {
    if (sealedCompletes) {
      return {
        track: "sealed",
        reason: "sealed_completes",
        savingsCents: 0,
        confidence,
      };
    }
    return {
      track: "singles",
      reason: "no_prices",
      savingsCents: 0,
      confidence: "low",
    };
  }
  const mixedSavings = singles.totalCents - mixed.totalCents;
  const threshold = Math.max(
    MIXED_MIN_SAVINGS_CENTS,
    singles.totalCents * MIXED_MIN_SAVINGS_RATIO,
  );
  if (
    sealedCompletes &&
    sealed.sealedCents < singles.totalCents &&
    sealed.sealedCents <= mixed.totalCents
  ) {
    return {
      track: "sealed",
      reason: "sealed_completes",
      savingsCents: singles.totalCents - sealed.sealedCents,
      confidence,
    };
  }
  if (mixedSavings >= threshold) {
    return {
      track: "mixed",
      reason: "mixed_saves",
      savingsCents: mixedSavings,
      confidence,
    };
  }
  return {
    track: "singles",
    reason: "singles_cheapest",
    savingsCents: 0,
    confidence,
  };
}

/**
 * Résout les trois voies (singles / mixte / scellé) et recommande.
 */
export function solveBuyPlan(input: {
  requirements: readonly Requirement[];
  skus: readonly SealedSku[];
  mode?: TargetMode;
  /** Règle d'arrêt du panier efficace (cartes neuves espérées / sachet). */
  sealedMinNewCardsPerPack?: number;
  /** Cible « tout avoir » : E[reste] maximal (défaut ½ carte). */
  sealedTargetRemainingCards?: number;
}): CompletionPlan {
  const flags = new Set<PlanFlag>();
  const holes = input.requirements.filter((r) => missingCopies(r) > 0);
  const copiesNeeded = holes.reduce((s, r) => s + missingCopies(r), 0);

  let pricedCount = 0;
  let imputedCount = 0;
  let unpricedCount = 0;
  for (const hole of holes) {
    if (hole.priceCents == null) unpricedCount += 1;
    else if (hole.priceImputed) imputedCount += 1;
    else pricedCount += 1;
  }
  if (unpricedCount > 0) flags.add("partialPrices");
  if (imputedCount > 0) flags.add("imputedPrices");
  for (const sku of input.skus) {
    if (
      sku.packs > 0 &&
      (sku.packHitByPrint == null || sku.packHitByPrint.size === 0)
    ) {
      flags.add("unknownRates");
    }
  }

  const prepared = prepareCandidates({ requirements: holes, skus: input.skus });
  const { table } = prepared;
  const empty = new Map<string, number>();

  /* ── Singles ── */
  const singlesEval = evaluatePlan(table, empty);
  const singles: SinglesTrack = {
    totalCents: Math.round(singlesEval.singlesCents),
    lines: singlesLines(table, empty),
    pricedCount: pricedCount + imputedCount,
    imputedCount,
    unpricedCount,
  };

  /* ── Mixte : panier efficace (cartes neuves / €) + reste à l'unité ── */
  const minPerPack =
    input.sealedMinNewCardsPerPack ?? SEALED_DEFAULT_MIN_NEW_CARDS_PER_PACK;
  const efficient = optimizeSealed({
    ...prepared,
    minNewCardsPerPack: minPerPack,
  });
  const mixedEval = evaluatePlan(table, efficient.quantities);
  const mixed: MixedTrack = {
    items: planItems(table, efficient.quantities),
    sealedCents: Math.round(mixedEval.sealedCents),
    singlesCents: Math.round(mixedEval.singlesCents),
    totalCents: Math.round(mixedEval.totalCents),
    expectedCardsFromSealed: round1(mixedEval.expectedCards),
    expectedCompletion:
      copiesNeeded > 0 ? mixedEval.expectedCards / copiesNeeded : 1,
    expectedRemainingCards: round1(mixedEval.expectedRemainingCards),
    singles: singlesLines(table, efficient.quantities),
    stopRule: { minNewCardsPerPack: minPerPack },
  };

  /* ── Scellé : espérer tout avoir ── */
  const target =
    input.sealedTargetRemainingCards ?? SEALED_COMPLETE_TARGET_REMAINING;
  const complete = planToCompleteInExpectation({
    table,
    families: prepared.families,
    target,
  });
  const completeQ = complete?.quantities ?? new Map<string, number>();
  const completeEval = evaluatePlan(table, completeQ);
  const sealed: SealedTrack = {
    items: planItems(table, completeQ),
    sealedCents: complete?.cents ?? 0,
    packs: complete?.packs ?? 0,
    expectedRemainingCards: round1(
      completeEval.expectedRemainingCards - (complete?.unreachableHoles ?? 0),
    ),
    unreachableHoles: complete?.unreachableHoles ?? holes.length,
    capped: complete?.capped ?? false,
    /* Rien à acheter : aucun SKU n'atteint un seul trou. */
    indeterminate: complete == null || completeQ.size === 0,
    target: { maxExpectedRemainingCards: target },
  };

  /* ── Flags d'hypothèses ── */
  const used = new Set([...efficient.quantities.keys(), ...completeQ.keys()]);
  for (const slug of used) {
    const sku = table.skus[table.indexOf(slug)];
    if (!sku) continue;
    if (sku.packs > 1) flags.add("independenceAssumed");
    if (
      sku.packs > 0 &&
      (sku.provenance === "community" || sku.provenance === "structural")
    ) {
      flags.add("lowConfidenceRates");
    }
  }

  const recommendation = recommend({
    holes: holes.length,
    singles,
    mixed,
    sealed,
  });

  return {
    mode: input.mode ?? "base-set",
    holes: holes.length,
    copiesNeeded,
    singles,
    mixed,
    sealed,
    recommendation,
    skuMetrics: skuMetrics(table, input.skus),
    flags: [...flags],
  };
}
