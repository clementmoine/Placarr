/**
 * Cost basis on sealed open / declare — equal split of the parent's purchase
 * price across content children. Shell is excluded (caller filters).
 *
 * Remainder cents go to the first children so the sum matches the parent.
 * No price → all nulls (honest, not zero).
 */

export function allocatePurchasePriceCents(input: {
  parentPriceCents: number | null | undefined;
  childCount: number;
}): Array<number | null> {
  const n = Math.max(0, Math.floor(input.childCount));
  if (n === 0) return [];
  const raw = input.parentPriceCents;
  if (raw == null || !Number.isFinite(raw) || raw < 0) {
    return Array.from({ length: n }, () => null);
  }
  const total = Math.round(raw);
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}
