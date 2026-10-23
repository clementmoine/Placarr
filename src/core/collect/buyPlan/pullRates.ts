/**
 * Taux de tirage par carte, lus dans les SKUs à loterie.
 *
 * Pour l'affichage checklist : « 1 sachet sur N » est un indicateur de
 * rareté **observé** (compositions de sachets), pas une étiquette de rareté
 * déclarée. On retient, par carte, le meilleur sachet disponible.
 */

import type { SealedSku } from "./types";

/**
 * printKey (canonique) → P(≥ 1 copie dans un sachet), max sur les SKUs à
 * taux connus. Les SKUs sans sachet ou sans taux ne contribuent pas.
 */
export function bestPackHitByPrint(
  skus: readonly SealedSku[],
): Map<string, number> {
  const best = new Map<string, number>();
  for (const sku of skus) {
    if (sku.packs <= 0 || !sku.packHitByPrint) continue;
    for (const [key, p] of sku.packHitByPrint) {
      if (!(p > 0)) continue;
      const current = best.get(key);
      if (current == null || p > current) best.set(key, p);
    }
  }
  return best;
}

/**
 * « 1 sachet sur N » : N = 1/p arrondi, ≥ 1. `null` si p n'est pas
 * exploitable.
 */
export function packsPerHit(p: number | null | undefined): number | null {
  if (p == null || !(p > 0)) return null;
  return Math.max(1, Math.round(1 / p));
}

export const PULL_RATE_LEVELS = 3;

/**
 * Rang 1..count d'un N dans l'échelle du set (1 = le plus commun) et
 * position 0..1 pour un rendu continu (camembert, jauge). Un seul palier
 * → rang 1, position 0.
 */
export function pullRateRank(
  n: number,
  scale: readonly number[],
): { rank: number; count: number; position: number } {
  const count = scale.length;
  if (count === 0 || !(n > 0))
    return { rank: 1, count: Math.max(1, count), position: 0 };
  let index = scale.findIndex((value) => value >= n);
  if (index < 0) index = count - 1;
  return {
    rank: index + 1,
    count,
    position: count > 1 ? index / (count - 1) : 0,
  };
}

/**
 * Échelle d'un set : ses N distincts (« 1 sachet sur N »), croissants.
 * Dans un set, les N viennent des slots de rareté : il y en a autant que
 * de paliers réels (commune, rare, légendaire…).
 */
export function pullRateScale(
  rates: Record<string, number> | ReadonlyMap<string, number>,
): number[] {
  const values = rates instanceof Map ? rates.values() : Object.values(rates);
  const distinct = new Set<number>();
  for (const n of values) if (n > 0) distinct.add(n);
  return [...distinct].sort((a, b) => a - b);
}

/**
 * Niveau 1..`levels` d'une carte **relatif à son set** : rang de son N
 * parmi les N distincts observés, ramené sur `levels`. Ordinal, donc
 * insensible aux extrêmes (une enchantée à 1/1728 n'écrase pas les rares à
 * 1/60) et sans seuil fixe. Un seul palier → niveau 1.
 */
export function pullRateTier(
  n: number,
  scale: readonly number[],
  levels = PULL_RATE_LEVELS,
): number {
  if (scale.length < 2 || !(n > 0)) return 1;
  return 1 + Math.round(pullRateRank(n, scale).position * (levels - 1));
}
