/**
 * Drops isolated high price samples when several observations exist for the same
 * condition. Only trims the upper tail — a lone cheap listing is kept because
 * it may still be a valid marketplace hit.
 */
export function trimPriceOutlierCents(values: number[]): number[] {
  let sorted = [...values].filter((value) => value > 0).sort((a, b) => a - b);
  if (sorted.length < 3) return sorted;

  while (sorted.length >= 3) {
    const trimmed = dropHighTailOutlier(sorted);
    if (!trimmed) break;
    sorted = trimmed;
  }

  return sorted;
}

function dropHighTailOutlier(sorted: number[]): number[] | null {
  if (sorted.length < 3) return null;

  const previous = sorted[sorted.length - 2];
  const max = sorted[sorted.length - 1];
  const clusterSpread = previous - sorted[0];
  const tailGap = max - previous;
  const minTailGap = Math.max(clusterSpread * 1.5, previous * 0.35, 1500);

  if (tailGap < minTailGap) return null;
  return sorted.slice(0, -1);
}

export function filterUsedPricesAboveNew<
  T extends {
    condition?: string | null;
    priceCents: number;
    source?: string | null;
    productName?: string | null;
  },
>(
  observations: T[],
  shelfType: string,
  isReferencePriceSource: (source: string) => boolean = () => false,
): T[] {
  const newOffers = observations.filter(
    (row) => row.condition === "new" && row.priceCents > 0,
  );
  if (newOffers.length === 0) return observations;

  const credibleNew = newOffers.filter(
    (row) =>
      !!row.productName?.trim() || isReferencePriceSource(row.source ?? ""),
  );
  const pool = credibleNew.length > 0 ? credibleNew : newOffers;

  const usedConditions = new Set(
    shelfType === "games" ? ["used", "loose", "cib"] : ["used"],
  );
  const hasUsed = observations.some(
    (row) => row.condition && usedConditions.has(row.condition),
  );
  if (!hasUsed) return observations;

  const newCeiling = Math.min(...pool.map((row) => row.priceCents));
  return observations.filter((row) => {
    if (!row.condition || !usedConditions.has(row.condition)) return true;
    if (isReferencePriceSource(row.source ?? "")) return true;
    return row.priceCents <= newCeiling;
  });
}

export function filterObservationsByOutlierTrim<
  T extends { condition?: string | null; priceCents: number },
>(observations: T[], conditions: string[]): T[] {
  const grouped = observations.filter(
    (observation) =>
      observation.condition && conditions.includes(observation.condition),
  );
  if (grouped.length < 3) return observations;

  const trimmed = trimPriceOutlierCents(grouped.map((row) => row.priceCents));
  const remaining = new Map<number, number>();
  for (const priceCents of trimmed) {
    remaining.set(priceCents, (remaining.get(priceCents) ?? 0) + 1);
  }

  return observations.filter((observation) => {
    if (!observation.condition || !conditions.includes(observation.condition)) {
      return true;
    }
    const count = remaining.get(observation.priceCents) ?? 0;
    if (count <= 0) return false;
    remaining.set(observation.priceCents, count - 1);
    return true;
  });
}
