/**
 * Espérances exactes d'un plan d'achat scellé.
 *
 * Pour un trou x à `m` copies manquantes :
 *   - G = copies garanties (decks, promos) par le plan ;
 *   - X = nombre de sachets contenant x = Σ_j Binomiale(N_j, p_{j,x}),
 *     N_j = unités_j × sachets_j (sachets indépendants) ;
 *   - E[reste_x] = E[max(0, m − G − X)] (Poisson-binomiale tronquée).
 *
 * m = 1 (cas courant) : E[reste_x] = Π_j (1 − p_{j,x})^{N_j} si G = 0.
 */

import type { Requirement, SealedSku } from "./types";

export type HitLookup = (sku: SealedSku, requirement: Requirement) => number;

function canon(key: string): string {
  return key.trim().toLowerCase();
}

/** p(≥1 copie du trou dans UN sachet de ce SKU) — 0 si taux inconnus. */
export function packHitProbability(
  sku: SealedSku,
  requirement: Requirement,
): number {
  const map = sku.packHitByPrint;
  if (!map || map.size === 0 || sku.packs <= 0) return 0;
  let best = 0;
  for (const print of requirement.acceptedPrints) {
    const p = map.get(print) ?? map.get(canon(print)) ?? 0;
    if (p > best) best = p;
  }
  return Math.min(1, Math.max(0, best));
}

/** Copies garanties du trou par UNE unité de ce SKU. */
export function guaranteedCopies(
  sku: SealedSku,
  requirement: Requirement,
): number {
  if (sku.guaranteed.length === 0) return 0;
  const accepted = new Set(requirement.acceptedPrints.map(canon));
  let count = 0;
  for (const print of sku.guaranteed) {
    if (accepted.has(canon(print))) count += 1;
  }
  return count;
}

/** Pré-calcul par (SKU, trou) : p par sachet et garanties par unité. */
export class HitTable {
  private readonly p: Float64Array;
  private readonly g: Float64Array;
  private readonly skuIndex: Map<string, number>;
  readonly holes: readonly Requirement[];
  readonly skus: readonly SealedSku[];

  constructor(holes: readonly Requirement[], skus: readonly SealedSku[]) {
    this.holes = holes;
    this.skus = skus;
    this.skuIndex = new Map(skus.map((s, i) => [s.slug, i]));
    this.p = new Float64Array(skus.length * holes.length);
    this.g = new Float64Array(skus.length * holes.length);
    skus.forEach((sku, j) => {
      holes.forEach((hole, x) => {
        this.p[j * holes.length + x] = packHitProbability(sku, hole);
        this.g[j * holes.length + x] = guaranteedCopies(sku, hole);
      });
    });
  }

  indexOf(slug: string): number {
    return this.skuIndex.get(slug) ?? -1;
  }

  pAt(skuIdx: number, holeIdx: number): number {
    return this.p[skuIdx * this.holes.length + holeIdx]!;
  }

  gAt(skuIdx: number, holeIdx: number): number {
    return this.g[skuIdx * this.holes.length + holeIdx]!;
  }

  /** Indices de trous touchés (p > 0 ou garantie) par ce SKU. */
  touched(skuIdx: number): number[] {
    const out: number[] = [];
    for (let x = 0; x < this.holes.length; x += 1) {
      if (this.pAt(skuIdx, x) > 0 || this.gAt(skuIdx, x) > 0) out.push(x);
    }
    return out;
  }
}

/**
 * E[max(0, need − X)] avec X = Σ Binomiale(n_i, p_i), tronqué à `need`.
 * `need` = copies manquantes après garanties (≥ 1).
 */
export function expectedShortfall(
  need: number,
  exposures: readonly { n: number; p: number }[],
): number {
  if (need <= 0) return 0;
  if (need === 1) {
    let miss = 1;
    for (const { n, p } of exposures) {
      if (n <= 0 || p <= 0) continue;
      if (p >= 1) return 0;
      miss *= (1 - p) ** n;
      if (miss < 1e-15) return 0;
    }
    return miss;
  }
  /* dist[k] = P(X = k) pour k < need ; masse ≥ need absorbée. */
  let dist = new Float64Array(need);
  dist[0] = 1;
  for (const { n, p } of exposures) {
    if (n <= 0 || p <= 0) continue;
    const binom = binomialPmfTruncated(n, p, need);
    const next = new Float64Array(need);
    for (let a = 0; a < need; a += 1) {
      const pa = dist[a]!;
      if (pa === 0) continue;
      for (let b = 0; a + b < need; b += 1) {
        next[a + b] = next[a + b]! + pa * binom[b]!;
      }
    }
    dist = next;
  }
  let expected = 0;
  for (let k = 0; k < need; k += 1) expected += (need - k) * dist[k]!;
  return expected;
}

/** P(Bin(n,p) = k) pour k < limit (stable, itératif). */
function binomialPmfTruncated(
  n: number,
  p: number,
  limit: number,
): Float64Array {
  const out = new Float64Array(limit);
  if (p >= 1) {
    if (n < limit) out[n] = 1;
    return out;
  }
  const q = 1 - p;
  let term = q ** n; /* k = 0 */
  if (term === 0) {
    /* underflow : utiliser log-space */
    const logq = Math.log(q);
    const logp = Math.log(p);
    let logTerm = n * logq;
    for (let k = 0; k < limit && k <= n; k += 1) {
      out[k] = Math.exp(logTerm);
      logTerm += Math.log(n - k) - Math.log(k + 1) + logp - logq;
    }
    return out;
  }
  for (let k = 0; k < limit && k <= n; k += 1) {
    out[k] = term;
    term = (term * (n - k) * p) / ((k + 1) * q);
  }
  return out;
}

export type HoleOutcome = {
  /** E[copies encore manquantes]. */
  expectedRemaining: number;
  /** P(au moins une copie encore manquante). */
  probabilityNeeded: number;
};

/**
 * Évalue un plan `quantities` (slug → unités) trou par trou.
 */
export function evaluateHoles(
  table: HitTable,
  quantities: ReadonlyMap<string, number>,
): HoleOutcome[] {
  const active: { j: number; units: number }[] = [];
  for (const [slug, units] of quantities) {
    if (units <= 0) continue;
    const j = table.indexOf(slug);
    if (j >= 0) active.push({ j, units });
  }
  return table.holes.map((hole, x) => {
    const missing = Math.max(0, hole.requiredCopies - hole.ownedCopies);
    if (missing === 0) return { expectedRemaining: 0, probabilityNeeded: 0 };
    let guaranteed = 0;
    const exposures: { n: number; p: number }[] = [];
    for (const { j, units } of active) {
      guaranteed += table.gAt(j, x) * units;
      const p = table.pAt(j, x);
      if (p > 0) exposures.push({ n: units * table.skus[j]!.packs, p });
    }
    const need = missing - guaranteed;
    if (need <= 0) return { expectedRemaining: 0, probabilityNeeded: 0 };
    const expectedRemaining = expectedShortfall(need, exposures);
    const probabilityNeeded =
      need === 1 ? expectedRemaining : expectedShortfall(1, exposures);
    return { expectedRemaining, probabilityNeeded };
  });
}

export type PlanEvaluation = {
  sealedCents: number;
  /** Σ prix_x × E[reste_x] (trous cotés seulement). */
  singlesCents: number;
  totalCents: number;
  /** Σ (manquant_x − E[reste_x]). */
  expectedCards: number;
  expectedRemainingCards: number;
  holes: HoleOutcome[];
};

export function evaluatePlan(
  table: HitTable,
  quantities: ReadonlyMap<string, number>,
): PlanEvaluation {
  let sealedCents = 0;
  for (const [slug, units] of quantities) {
    if (units <= 0) continue;
    const j = table.indexOf(slug);
    if (j < 0) continue;
    sealedCents += (table.skus[j]!.priceCents ?? 0) * units;
  }
  const holes = evaluateHoles(table, quantities);
  let singlesCents = 0;
  let expectedCards = 0;
  let expectedRemainingCards = 0;
  table.holes.forEach((hole, x) => {
    const missing = Math.max(0, hole.requiredCopies - hole.ownedCopies);
    const rem = holes[x]!.expectedRemaining;
    expectedCards += missing - rem;
    expectedRemainingCards += rem;
    if (hole.priceCents != null) singlesCents += hole.priceCents * rem;
  });
  return {
    sealedCents,
    singlesCents,
    totalCents: sealedCents + singlesCents,
    expectedCards,
    expectedRemainingCards,
    holes,
  };
}

/**
 * État incrémental pour la recherche gloutonne : conserve par trou les
 * expositions courantes, et chiffre « +1 unité de j » sans tout recalculer.
 */
export class PlanState {
  readonly table: HitTable;
  readonly quantities: Map<string, number>;
  private outcomes: HoleOutcome[];

  constructor(table: HitTable, quantities?: ReadonlyMap<string, number>) {
    this.table = table;
    this.quantities = new Map(quantities ?? []);
    this.outcomes = evaluateHoles(table, this.quantities);
  }

  snapshot(): PlanEvaluation {
    return evaluatePlan(this.table, this.quantities);
  }

  holeOutcome(x: number): HoleOutcome {
    return this.outcomes[x]!;
  }

  /**
   * Effet marginal d'ajouter `units` unités de SKU j :
   * baisse de E[coût singles] et cartes neuves espérées.
   */
  marginal(
    j: number,
    units = 1,
  ): { singlesDropCents: number; newCards: number } {
    const touched = this.table.touched(j);
    if (touched.length === 0) return { singlesDropCents: 0, newCards: 0 };
    const trial = new Map(this.quantities);
    const slug = this.table.skus[j]!.slug;
    trial.set(slug, (trial.get(slug) ?? 0) + units);
    let singlesDropCents = 0;
    let newCards = 0;
    for (const x of touched) {
      const before = this.outcomes[x]!.expectedRemaining;
      if (before <= 0) continue;
      const after = evaluateHole(this.table, trial, x).expectedRemaining;
      const gain = Math.max(0, before - after);
      newCards += gain;
      const price = this.table.holes[x]!.priceCents;
      if (price != null) singlesDropCents += price * gain;
    }
    return { singlesDropCents, newCards };
  }

  add(j: number, units = 1): void {
    const slug = this.table.skus[j]!.slug;
    const next = (this.quantities.get(slug) ?? 0) + units;
    if (next <= 0) this.quantities.delete(slug);
    else this.quantities.set(slug, next);
    for (const x of this.table.touched(j)) {
      this.outcomes[x] = evaluateHole(this.table, this.quantities, x);
    }
  }

  setQuantities(quantities: ReadonlyMap<string, number>): void {
    this.quantities.clear();
    for (const [slug, n] of quantities) if (n > 0) this.quantities.set(slug, n);
    this.outcomes = evaluateHoles(this.table, this.quantities);
  }
}

function evaluateHole(
  table: HitTable,
  quantities: ReadonlyMap<string, number>,
  x: number,
): HoleOutcome {
  const hole = table.holes[x]!;
  const missing = Math.max(0, hole.requiredCopies - hole.ownedCopies);
  if (missing === 0) return { expectedRemaining: 0, probabilityNeeded: 0 };
  let guaranteed = 0;
  const exposures: { n: number; p: number }[] = [];
  for (const [slug, units] of quantities) {
    if (units <= 0) continue;
    const j = table.indexOf(slug);
    if (j < 0) continue;
    guaranteed += table.gAt(j, x) * units;
    const p = table.pAt(j, x);
    if (p > 0) exposures.push({ n: units * table.skus[j]!.packs, p });
  }
  const need = missing - guaranteed;
  if (need <= 0) return { expectedRemaining: 0, probabilityNeeded: 0 };
  const expectedRemaining = expectedShortfall(need, exposures);
  return {
    expectedRemaining,
    probabilityNeeded:
      need === 1 ? expectedRemaining : expectedShortfall(1, exposures),
  };
}
