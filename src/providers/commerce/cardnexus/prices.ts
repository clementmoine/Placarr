/**
 * Map CardNexus `pricesByFinish` → Placarr new/foil EUR cents (EU region).
 */

export type CardnexusMoney = {
  amount?: number;
  currency?: string;
};

export type CardnexusFinishBlock = {
  cardnexus?: {
    low?: CardnexusMoney;
    regions?: {
      eu?: {
        currency?: string;
        low?: number;
        byCondition?: Record<string, { low?: number }>;
      };
    };
  };
};

export type CardnexusPricesByFinish = Record<string, CardnexusFinishBlock>;

export type CardnexusPriceCard = {
  id: number;
  name: string;
  gameId: string;
  printNumber: string | null;
  expansionCode: string | null;
  sourceUrl: string;
  newCents: number | null;
  foilCents: number | null;
};

function euroToCents(amount: number | null | undefined): number | null {
  if (amount == null || !Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

/** Prefer EU NM low, then EU low, then global EUR low. */
export function euroLowCentsFromFinish(
  block: CardnexusFinishBlock | null | undefined,
): number | null {
  const cn = block?.cardnexus;
  if (!cn) return null;
  const eu = cn.regions?.eu;
  if (eu) {
    const nm = eu.byCondition?.NM?.low ?? eu.byCondition?.nm?.low;
    if (typeof nm === "number") return euroToCents(nm);
    if (typeof eu.low === "number") return euroToCents(eu.low);
  }
  const low = cn.low;
  if (low && (low.currency ?? "EUR").toUpperCase() === "EUR") {
    return euroToCents(low.amount);
  }
  return null;
}

export function centsFromPricesByFinish(prices: CardnexusPricesByFinish | null | undefined): {
  newCents: number | null;
  foilCents: number | null;
} {
  if (!prices) return { newCents: null, foilCents: null };
  const standard =
    prices.Standard ?? prices.standard ?? prices.NonFoil ?? prices.nonfoil;
  const foil = prices.Foil ?? prices.foil;
  return {
    newCents: euroLowCentsFromFinish(standard),
    foilCents: euroLowCentsFromFinish(foil),
  };
}

export function productSourceUrl(productId: number): string {
  return `https://cardnexus.com/product/${productId}`;
}
