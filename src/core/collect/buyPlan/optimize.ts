/**
 * Optimiseur de la voie **scellé** (la voie mixte réutilise son panier).
 *
 * Granularité : on choisit à l'unité de *sachet* (le SKU unitaire de chaque
 * famille de tirage), puis on **consolide** en boîtes (display, trove) quand
 * c'est moins cher — la boîte n'est jamais présupposée.
 */

import { HitTable, PlanState, evaluatePlan } from "./expectation";
import type { Requirement, SealedSku } from "./types";

const MAX_STEPS = 5000;
const MAX_CONSOLIDATION_EXTENSIONS = 40;

export function isUsableSku(sku: SealedSku): boolean {
  if (sku.priceCents == null || !(sku.priceCents > 0)) return false;
  if (sku.guaranteed.length > 0) return true;
  return (
    sku.packs > 0 && sku.packHitByPrint != null && sku.packHitByPrint.size > 0
  );
}

/** Loterie pure : pas de garantie, des sachets chiffrés. */
export function isLotteryOnly(sku: SealedSku): boolean {
  return (
    sku.guaranteed.length === 0 &&
    sku.packs > 0 &&
    sku.packHitByPrint != null &&
    sku.packHitByPrint.size > 0
  );
}

/** Empreinte des p par print — deux SKUs au même tirage sont fongibles. */
export function hitMapFingerprint(sku: SealedSku): string | null {
  const map = sku.packHitByPrint;
  if (!map || map.size === 0) return null;
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const [key, p] of map) {
    const canon = key.trim().toLowerCase();
    if (seen.has(canon)) continue;
    seen.add(canon);
    parts.push(`${canon}:${p.toFixed(8)}`);
  }
  parts.sort();
  return parts.join("|");
}

export type PackFamily = {
  fingerprint: string;
  /** SKU au plus petit nombre de sachets (ex æquo : moins cher). */
  unit: SealedSku;
  /** Tous les SKUs de la famille, unit compris. */
  members: SealedSku[];
};

/**
 * Regroupe les SKUs loterie pure par profil de tirage.
 */
export function packFamilies(skus: readonly SealedSku[]): PackFamily[] {
  const byFp = new Map<string, SealedSku[]>();
  for (const sku of skus) {
    if (!isUsableSku(sku) || !isLotteryOnly(sku)) continue;
    const fp = hitMapFingerprint(sku);
    if (fp == null) continue;
    const bag = byFp.get(fp) ?? [];
    bag.push(sku);
    byFp.set(fp, bag);
  }
  const out: PackFamily[] = [];
  for (const [fingerprint, members] of byFp) {
    const unit = [...members].sort((a, b) => {
      if (a.packs !== b.packs) return a.packs - b.packs;
      return a.priceCents! - b.priceCents!;
    })[0]!;
    out.push({ fingerprint, unit, members });
  }
  return out;
}

export type Candidates = {
  table: HitTable;
  /** Indices (dans `table.skus`) des SKUs choisissables à l'unité. */
  candidates: number[];
  families: PackFamily[];
  /** Prix du sachet de référence (unité la moins chère €/sachet). */
  referencePackCents: number | null;
};

/**
 * Prépare la table de tirage et la liste des candidats :
 * bundles (garanties ± sachets) + un unitaire par famille.
 */
export function prepareCandidates(input: {
  requirements: readonly Requirement[];
  skus: readonly SealedSku[];
}): Candidates {
  const usable = input.skus.filter(isUsableSku);
  const families = packFamilies(usable);
  const familySlugs = new Set(
    families.flatMap((f) => f.members.map((m) => m.slug)),
  );
  const bundles = usable.filter((s) => !familySlugs.has(s.slug));
  const table = new HitTable(input.requirements, usable);
  const candidates = [
    ...bundles.map((s) => table.indexOf(s.slug)),
    ...families.map((f) => table.indexOf(f.unit.slug)),
  ].filter((i) => i >= 0);
  let referencePackCents: number | null = null;
  for (const f of families) {
    const cpp = f.unit.priceCents! / Math.max(1, f.unit.packs);
    if (referencePackCents == null || cpp < referencePackCents) {
      referencePackCents = cpp;
    }
  }
  return { table, candidates, families, referencePackCents };
}

/* ── Consolidation ─────────────────────────────────────────────────────── */

type Composition = Map<string, number>;

/**
 * Coût minimal pour exactement k sachets avec les membres de la famille,
 * pour k ∈ [0, maxPacks]. `cost[k] = Infinity` si impossible.
 */
function familyCostTable(
  family: PackFamily,
  maxPacks: number,
): { cost: Float64Array; choice: Int32Array } {
  const cost = new Float64Array(maxPacks + 1).fill(Number.POSITIVE_INFINITY);
  const choice = new Int32Array(maxPacks + 1).fill(-1);
  cost[0] = 0;
  for (let k = 1; k <= maxPacks; k += 1) {
    family.members.forEach((m, idx) => {
      if (m.packs <= 0 || m.packs > k) return;
      const c = cost[k - m.packs]! + m.priceCents!;
      if (c < cost[k]!) {
        cost[k] = c;
        choice[k] = idx;
      }
    });
  }
  return { cost, choice };
}

function compositionFor(
  family: PackFamily,
  choice: Int32Array,
  k: number,
): Composition {
  const out: Composition = new Map();
  let rest = k;
  while (rest > 0) {
    const idx = choice[rest]!;
    if (idx < 0) break;
    const m = family.members[idx]!;
    out.set(m.slug, (out.get(m.slug) ?? 0) + 1);
    rest -= m.packs;
  }
  return out;
}

function withFamilyComposition(
  base: ReadonlyMap<string, number>,
  family: PackFamily,
  composition: Composition,
): Map<string, number> {
  const next = new Map(base);
  for (const m of family.members) next.delete(m.slug);
  for (const [slug, n] of composition) if (n > 0) next.set(slug, n);
  return next;
}

function familyPacks(
  quantities: ReadonlyMap<string, number>,
  family: PackFamily,
): number {
  let packs = 0;
  for (const m of family.members)
    packs += (quantities.get(m.slug) ?? 0) * m.packs;
  return packs;
}

/**
 * Remplace les unitaires de chaque famille par la composition de boîtes qui
 * minimise `objective` — en autorisant **plus** de sachets qu'au départ si
 * une boîte moins chère €/sachet rend ça optimal.
 */
export function consolidateFamilies(input: {
  table: HitTable;
  families: readonly PackFamily[];
  quantities: ReadonlyMap<string, number>;
  /** Objectif à minimiser pour une composition donnée. */
  objective: (quantities: ReadonlyMap<string, number>) => number;
  /** Au-dessous du nombre de sachets initial : interdit (scellé-only). */
  allowFewerPacks: boolean;
}): Map<string, number> {
  let current = new Map(input.quantities);
  for (const family of input.families) {
    const n0 = familyPacks(current, family);
    if (n0 <= 0) continue;
    const maxMember = Math.max(...family.members.map((m) => m.packs));
    let upper = n0 + maxMember;
    let best = {
      k: n0,
      value: Number.POSITIVE_INFINITY,
      comp: new Map<string, number>(),
    };
    let lower = input.allowFewerPacks ? 0 : n0;
    for (let ext = 0; ext < MAX_CONSOLIDATION_EXTENSIONS; ext += 1) {
      const { cost, choice } = familyCostTable(family, upper);
      for (let k = lower; k <= upper; k += 1) {
        if (!Number.isFinite(cost[k]!)) continue;
        const comp = compositionFor(family, choice, k);
        const trial = withFamilyComposition(current, family, comp);
        const value = input.objective(trial);
        if (value < best.value - 1e-9) best = { k, value, comp };
      }
      if (best.k < upper - maxMember + 1) break;
      lower = upper + 1;
      upper += maxMember;
    }
    current = withFamilyComposition(current, family, best.comp);
  }
  return current;
}

/* ── Voie scellé ────────────────────────────────────────────────────────── */

/**
 * Règle d'arrêt par défaut : on cesse d'ouvrir quand le meilleur candidat
 * apporte moins de **0,5 carte neuve espérée par sachet** (au prix du
 * sachet de référence). Exposée dans le plan, pas cachée.
 */
export const SEALED_DEFAULT_MIN_NEW_CARDS_PER_PACK = 0.5;

export type SealedResult = {
  quantities: Map<string, number>;
  indeterminate: boolean;
};

/**
 * Loterie seule : glouton sur les cartes neuves espérées par €, arrêt sur
 * rendement marginal, puis consolidation au moindre coût (≥ sachets choisis).
 */
export function optimizeSealed(
  input: Candidates & { minNewCardsPerPack?: number },
): SealedResult {
  const { table, candidates } = input;
  if (candidates.length === 0) {
    return { quantities: new Map(), indeterminate: true };
  }
  const minPerPack =
    input.minNewCardsPerPack ?? SEALED_DEFAULT_MIN_NEW_CARDS_PER_PACK;
  const state = new PlanState(table);

  for (let step = 0; step < MAX_STEPS; step += 1) {
    let bestIdx = -1;
    let bestScore = 0;
    let bestPerPack = 0;
    for (const j of candidates) {
      const price = table.skus[j]!.priceCents!;
      const { newCards } = state.marginal(j);
      if (newCards <= 1e-9) continue;
      const score = newCards / price;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = j;
        const ref = input.referencePackCents ?? price;
        bestPerPack = newCards / (price / ref);
      }
    }
    if (bestIdx < 0 || bestPerPack < minPerPack) break;
    state.add(bestIdx);
  }

  const quantities = consolidateFamilies({
    table,
    families: input.families,
    quantities: state.quantities,
    /* Moindre coût ; à coût égal, plus de sachets (ordre d'évaluation). */
    objective: (q) => {
      const e = evaluatePlan(table, q);
      return e.sealedCents - e.expectedCards * 1e-6;
    },
    allowFewerPacks: false,
  });
  return { quantities, indeterminate: false };
}

/* ── Scellé : espérer tout avoir ───────────────────────────────────────── */

/** Cible par défaut : E[cartes encore manquantes] ≤ ½ carte. */
export const SEALED_COMPLETE_TARGET_REMAINING = 0.5;

export type CompletePlan = {
  quantities: Map<string, number>;
  /** Sachets de la famille dominante (après consolidation). */
  packs: number;
  cents: number;
  /** Trous qu'aucun SKU ne peut fournir (ni taux, ni garantie). */
  unreachableHoles: number;
  /** Borne de calcul atteinte : plan tronqué. */
  capped: boolean;
};

/**
 * Plan scellé pour **espérer tout avoir** : E[reste] ≤ `target` sur les
 * trous atteignables.
 *
 * 1. Trous hors loterie → couverts par bundles garantis (set cover glouton
 *    sur trous/€) ; sans aucune source : `unreachableHoles`.
 * 2. Sachets de la famille dominante (plus de trous couverts, puis €/sachet)
 *    par dichotomie jusqu'à la cible.
 * 3. Un bundle garantissant des trous rares est ajouté s'il économise plus
 *    de sachets qu'il ne coûte (répété jusqu'à stabilité).
 * 4. Consolidation des sachets en boîtes au moindre coût.
 */
export function planToCompleteInExpectation(input: {
  table: HitTable;
  families: readonly PackFamily[];
  maxPacks?: number;
  target?: number;
}): CompletePlan | null {
  const { table } = input;
  const maxPacks = input.maxPacks ?? 20000;
  const target = input.target ?? SEALED_COMPLETE_TARGET_REMAINING;
  const H = table.holes.length;
  if (H === 0) return null;

  /* Famille dominante. */
  let family: PackFamily | null = null;
  let covered = -1;
  for (const f of input.families) {
    const j = table.indexOf(f.unit.slug);
    if (j < 0) continue;
    const c = table.touched(j).length;
    const cpp = f.unit.priceCents! / f.unit.packs;
    if (
      family == null ||
      c > covered ||
      (c === covered && cpp < family.unit.priceCents! / family.unit.packs)
    ) {
      family = f;
      covered = c;
    }
  }
  const familySlugs = new Set(
    input.families.flatMap((f) => f.members.map((m) => m.slug)),
  );
  const bundleIdx: number[] = [];
  table.skus.forEach((sku, j) => {
    if (!familySlugs.has(sku.slug) && isUsableSku(sku)) bundleIdx.push(j);
  });
  if (!family && bundleIdx.length === 0) return null;

  const reachable = new Set<number>(
    family ? table.touched(table.indexOf(family.unit.slug)) : [],
  );
  const guaranteedBy = (j: number): number[] => {
    const out: number[] = [];
    for (let x = 0; x < H; x += 1) if (table.gAt(j, x) > 0) out.push(x);
    return out;
  };

  /* 1. Couverture des trous hors loterie. */
  const chosen = new Map<string, number>();
  const uncovered = new Set<number>();
  for (let x = 0; x < H; x += 1) if (!reachable.has(x)) uncovered.add(x);
  const anySource = new Set<number>();
  for (const j of bundleIdx) for (const x of guaranteedBy(j)) anySource.add(x);
  for (const x of [...uncovered]) if (!anySource.has(x)) uncovered.delete(x);
  const unreachableHoles = [...Array(H).keys()].filter(
    (x) => !reachable.has(x) && !anySource.has(x),
  );
  while (uncovered.size > 0) {
    let best: { j: number; gain: number } | null = null;
    for (const j of bundleIdx) {
      if (chosen.has(table.skus[j]!.slug)) continue;
      const hits = guaranteedBy(j).filter((x) => uncovered.has(x)).length;
      if (hits === 0) continue;
      const gain = hits / table.skus[j]!.priceCents!;
      if (!best || gain > best.gain) best = { j, gain };
    }
    if (!best) break;
    chosen.set(table.skus[best.j]!.slug, 1);
    for (const x of guaranteedBy(best.j)) uncovered.delete(x);
  }

  const unreachableSet = new Set(unreachableHoles);
  const remainingWith = (quantities: ReadonlyMap<string, number>): number => {
    const e = evaluatePlan(table, quantities);
    let rem = 0;
    for (let x = 0; x < H; x += 1) {
      if (!unreachableSet.has(x)) rem += e.holes[x]!.expectedRemaining;
    }
    return rem;
  };

  /* 2. Sachets nécessaires (dichotomie sur multiples de l'unité). */
  const unitPacks = family?.unit.packs ?? 1;
  const cap = Math.max(unitPacks, Math.floor(maxPacks / unitPacks) * unitPacks);
  let capped = false;
  const packsNeeded = (bundles: ReadonlyMap<string, number>): number => {
    if (!family) return 0;
    const withPacks = (packs: number) => {
      const q = new Map(bundles);
      if (packs > 0) q.set(family.unit.slug, packs / unitPacks);
      return remainingWith(q);
    };
    if (withPacks(0) <= target) return 0;
    let lo = 0;
    let hi = unitPacks;
    while (withPacks(hi) > target) {
      if (hi >= cap) {
        capped = true;
        return cap;
      }
      lo = hi;
      hi = Math.min(cap, hi * 2);
    }
    while (hi - lo > unitPacks) {
      const mid = lo + Math.floor((hi - lo) / 2 / unitPacks) * unitPacks;
      if (mid <= lo) break;
      if (withPacks(mid) > target) lo = mid;
      else hi = mid;
    }
    return hi;
  };

  let packs = packsNeeded(chosen);

  /* 3. Bundles qui économisent plus de sachets qu'ils ne coûtent. */
  if (family) {
    const cpp = family.unit.priceCents! / unitPacks;
    for (let iter = 0; iter < bundleIdx.length; iter += 1) {
      let best: { slug: string; packs: number; saving: number } | null = null;
      for (const j of bundleIdx) {
        const sku = table.skus[j]!;
        if (chosen.has(sku.slug)) continue;
        if (!guaranteedBy(j).some((x) => reachable.has(x))) continue;
        const trial = new Map(chosen);
        trial.set(sku.slug, 1);
        const n = packsNeeded(trial);
        const saving = (packs - n) * cpp - sku.priceCents!;
        if (saving > 0 && (!best || saving > best.saving)) {
          best = { slug: sku.slug, packs: n, saving };
        }
      }
      if (!best) break;
      chosen.set(best.slug, 1);
      packs = best.packs;
    }
  }

  /* 4. Consolidation au moindre coût pour ≥ packs. */
  const quantities = new Map(chosen);
  let packsOut = 0;
  if (family && packs > 0) {
    const maxMember = Math.max(...family.members.map((m) => m.packs));
    const { cost, choice } = familyCostTable(family, packs + maxMember);
    let bestK = packs;
    for (let k = packs; k <= packs + maxMember; k += 1) {
      if (cost[k]! < cost[bestK]!) bestK = k;
    }
    for (const [slug, n] of compositionFor(family, choice, bestK)) {
      quantities.set(slug, n);
    }
    packsOut = bestK;
  }
  let cents = 0;
  for (const [slug, n] of quantities) {
    cents += (table.skus[table.indexOf(slug)]!.priceCents ?? 0) * n;
  }
  return {
    quantities,
    packs: packsOut,
    cents: Math.round(cents),
    unreachableHoles: unreachableHoles.length,
    capped,
  };
}
