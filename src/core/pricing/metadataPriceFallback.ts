import type { MetadataFact } from "@/types/metadataProvider";

import type { BarcodePricesResult } from "@/core/pricing/resolver";

function parseEuroCents(value?: string | null): number | null {
  if (!value?.trim()) return null;
  const match = value.match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (!match) return null;
  const amount = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function factConditionBucket(fact: MetadataFact): "new" | "used" | null {
  if (fact.kind === "observed-price") return "new";

  const label = `${fact.label ?? ""} ${fact.value ?? ""}`.toLowerCase();
  if (/\b(neuf|new)\b/.test(label)) return "new";
  if (/\b(occasion|used|marketplace)\b/.test(label)) return "used";
  if (fact.kind === "price") return "used";
  return null;
}

function minCents(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.min(...values);
}

export function priceSummaryFromMetadataFacts(
  facts: MetadataFact[] | undefined,
): Pick<BarcodePricesResult, "priceNew" | "priceUsed" | "priceUsedCIB"> | null {
  if (!facts?.length) return null;

  const newPrices: number[] = [];
  const usedPrices: number[] = [];

  for (const fact of facts) {
    if (
      fact.kind !== "price" &&
      fact.kind !== "observed-price" &&
      fact.kind !== "estimated-value"
    ) {
      continue;
    }

    const cents = parseEuroCents(fact.value);
    if (cents == null) continue;

    const bucket = factConditionBucket(fact);
    if (bucket === "new") newPrices.push(cents);
    if (bucket === "used") usedPrices.push(cents);
  }

  const priceNew = minCents(newPrices);
  const priceUsed = minCents(usedPrices);

  if (priceNew == null && priceUsed == null) return null;

  return {
    priceNew,
    priceUsed,
    priceUsedCIB: null,
  };
}

export function metadataPriceFallback(
  facts: MetadataFact[] | undefined,
): BarcodePricesResult | null {
  const summary = priceSummaryFromMetadataFacts(facts);
  if (!summary) return null;

  return {
    ...summary,
    priceLastUpdated: null,
    priceSources: [],
    priceSourceDisplayNames: [],
    isReferencePriceOnly: false,
    priceObservations: [],
  };
}
