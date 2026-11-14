/**
 * Affichage checklist : retirer les cotes ~ (médiane de rareté) du total et
 * des listes, comme si on n'avait pas l'info — sans recalculer le plan.
 */

import type { CompletionPlan, SinglesLine, SinglesTrack } from "./types";

function sumExpected(lines: readonly SinglesLine[]): number {
  return Math.round(
    lines.reduce((sum, line) => sum + line.expectedCostCents, 0),
  );
}

function stripImputedLines(
  lines: readonly SinglesLine[],
): readonly SinglesLine[] {
  return lines.filter((line) => !line.priceImputed);
}

function stripSinglesTrack(singles: SinglesTrack): SinglesTrack {
  if (singles.imputedCount === 0) return singles;
  const lines = stripImputedLines(singles.lines);
  const moved = singles.imputedCount;
  return {
    ...singles,
    lines,
    totalCents: sumExpected(lines),
    pricedCount: Math.max(0, singles.pricedCount - moved),
    imputedCount: 0,
    unpricedCount: singles.unpricedCount + moved,
  };
}

/**
 * Plan d'affichage sans cotes approximées : elles rejoignent « sans cote »
 * et sortent du total singles / du reste mixte.
 */
export function withoutImputedPrices(plan: CompletionPlan): CompletionPlan {
  if (plan.singles.imputedCount === 0 && !plan.flags.includes("imputedPrices")) {
    return plan;
  }

  const singles = stripSinglesTrack(plan.singles);
  const mixedLines = stripImputedLines(plan.mixed.singles);
  const mixedSinglesCents = sumExpected(mixedLines);
  const mixed = {
    ...plan.mixed,
    singles: mixedLines,
    singlesCents: mixedSinglesCents,
    totalCents: plan.mixed.sealedCents + mixedSinglesCents,
  };

  const flags = plan.flags.filter((flag) => flag !== "imputedPrices");
  if (singles.unpricedCount > 0 && !flags.includes("partialPrices")) {
    flags.push("partialPrices");
  }

  return {
    ...plan,
    singles,
    mixed,
    flags,
  };
}

/** Retire les clés ~ du map de cotes liste / export. */
export function pricesWithoutImputed(
  prices: Record<string, number>,
  imputedPrices: Record<string, true> | undefined,
): Record<string, number> {
  if (!imputedPrices || Object.keys(imputedPrices).length === 0) return prices;
  const out: Record<string, number> = {};
  for (const [key, cents] of Object.entries(prices)) {
    if (imputedPrices[key] === true) continue;
    out[key] = cents;
  }
  return out;
}
