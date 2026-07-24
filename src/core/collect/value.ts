import type { Condition } from "@prisma/client";
import { shelfSupportsLooseCondition } from "@/core/collect/condition";

export type ItemPriceValues = {
  condition?: Condition | null;
  shelfType?: string | null;
  priceNew?: number | null;
  priceUsed?: number | null;
  priceUsedCIB?: number | null;
  /** Catalog-estimate point price (cote médiane) — lowest-priority fallback. */
  priceEstimated?: number | null;
};

export type ItemValueEstimate = {
  cents: number;
  /** True when the value falls back to a catalog estimate (display it as ~). */
  isEstimate: boolean;
};

function withProvenance(
  observed: number | null | undefined,
  estimated: number | null | undefined,
): ItemValueEstimate | null {
  if (observed != null) return { cents: observed, isEstimate: false };
  if (estimated != null) return { cents: estimated, isEstimate: true };
  return null;
}

function usedMarketObserved(item: ItemPriceValues): number | null | undefined {
  return shelfSupportsLooseCondition(item.shelfType)
    ? (item.priceUsedCIB ?? item.priceUsed ?? item.priceNew)
    : (item.priceUsed ?? item.priceNew);
}

/** Loose / cartouche-disque / console seule — only true loose market observations. */
function looseMarketObserved(item: ItemPriceValues): number | null | undefined {
  if (shelfSupportsLooseCondition(item.shelfType)) {
    // Do not fall back to CIB / new as an *observed* loose price: a boxed retail
    // listing is not a cartridge-only / console-out-of-box sale.
    return item.priceUsed;
  }
  return item.priceUsed ?? item.priceNew;
}

/** Boxed market as a rough ~signal when no loose observation or catalog estimate. */
function looseEstimateFallback(
  item: ItemPriceValues,
): number | null | undefined {
  if (shelfSupportsLooseCondition(item.shelfType)) {
    return item.priceEstimated ?? item.priceUsedCIB ?? null;
  }
  return item.priceEstimated;
}

function scaleEstimate(
  base: ItemValueEstimate | null,
  factor: number,
): ItemValueEstimate | null {
  if (!base || base.cents <= 0) return null;
  return { ...base, cents: Math.round(base.cents * factor) };
}

export function getItemValueEstimate(
  item: ItemPriceValues,
): ItemValueEstimate | null {
  if (!item.condition) return null;

  if (item.condition === "new") {
    return withProvenance(item.priceNew, item.priceEstimated);
  }

  if (item.condition === "used") {
    return withProvenance(usedMarketObserved(item), item.priceEstimated);
  }

  if (item.condition === "loose") {
    return withProvenance(looseMarketObserved(item), looseEstimateFallback(item));
  }

  if (item.condition === "damaged") {
    return scaleEstimate(
      withProvenance(usedMarketObserved(item), item.priceEstimated),
      0.5,
    );
  }

  return null;
}

export function getEstimatedItemValueCents(item: ItemPriceValues) {
  return getItemValueEstimate(item)?.cents ?? null;
}
