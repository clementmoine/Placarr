/**
 * Derived Lorcana foil state that must refresh after browser meta hydrate.
 * Manifest / recipes read live from foilMetaLoad; this generation lets
 * callers (and tests) observe the hydrate afterHydrate hook.
 */

let generation = 0;

export function invalidateLorcanaFoilMetaDerived(): void {
  generation += 1;
}

export function lorcanaFoilMetaGeneration(): number {
  return generation;
}
