import type { Condition } from "@prisma/client";

export type ItemPriceValues = {
  condition?: Condition | null;
  shelfType?: string | null;
  priceNew?: number | null;
  priceUsed?: number | null;
  priceUsedCIB?: number | null;
};

export function getEstimatedItemValueCents(item: ItemPriceValues) {
  if (!item.condition) return null;

  if (item.condition === "new") {
    return item.priceNew ?? null;
  }

  if (item.condition === "used") {
    if (item.shelfType === "games") {
      return item.priceUsedCIB ?? item.priceUsed ?? null;
    }
    return item.priceUsed ?? null;
  }

  if (item.condition === "damaged") {
    const base =
      item.shelfType === "games"
        ? (item.priceUsedCIB ?? item.priceUsed)
        : item.priceUsed;
    return base ? Math.round(base * 0.5) : null;
  }

  return null;
}
