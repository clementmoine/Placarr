import type { Condition } from "@prisma/client";

/**
 * Shelf item grades, ordered best → worst.
 * - new: sealed or opened-mint (no separate blister grade)
 * - used: complete in box when CIB exists
 * - loose: cartouche / disque / console seule (sans boîte)
 * - damaged: compromised copy
 *
 * Market `PriceOffer.condition` (new/loose/cib/used) stays separate.
 */
export const ITEM_CONDITIONS = [
  "new",
  "used",
  "loose",
  "damaged",
] as const satisfies readonly Condition[];

export type ItemCondition = (typeof ITEM_CONDITIONS)[number];

export function isItemCondition(value: string | null | undefined): value is Condition {
  return (
    typeof value === "string" &&
    (ITEM_CONDITIONS as readonly string[]).includes(value)
  );
}

/**
 * Resolve a write payload condition. Accepts current grades; maps removed
 * legacy grades (`likeNew` → `new`, `fair` → `used`) so stale clients don't
 * 500 against the narrowed Prisma enum. Returns null when the value is
 * present but unrecognized.
 */
export function parseItemCondition(
  value: unknown,
  fallback?: Condition,
): Condition | null {
  if (value == null || value === "") {
    return fallback ?? null;
  }
  if (typeof value !== "string") return null;
  if (isItemCondition(value)) return value;
  if (value === "likeNew") return "new";
  if (value === "fair") return "used";
  return null;
}

/**
 * Games + hardware share PriceCharting-style grades (loose vs CIB/boxed).
 * Books, boardgames, movies, etc. do not offer "loose".
 */
export function shelfSupportsLooseCondition(
  shelfType?: string | null,
): boolean {
  return shelfType === "games" || shelfType === "hardware";
}

/**
 * Loose (cartouche / disque / console seule) is a games+hardware market grade.
 */
export function itemConditionsForShelfType(
  shelfType?: string | null,
): readonly ItemCondition[] {
  if (shelfSupportsLooseCondition(shelfType)) return ITEM_CONDITIONS;
  return ITEM_CONDITIONS.filter((condition) => condition !== "loose");
}

/** Which market observation conditions belong on the item detail price list. */
export function marketOfferConditionsForItem(
  condition?: string | null,
  shelfType?: string | null,
  prices?: { priceUsedCIB?: number | null } | null,
): string[] {
  if (condition === "new") return ["new"];

  if (condition === "used") {
    if (shelfSupportsLooseCondition(shelfType)) {
      // CIB aggregate includes explicit cib + shop "used" (boxed retail).
      return prices?.priceUsedCIB ? ["cib", "used"] : ["loose", "used"];
    }
    return ["used"];
  }

  if (condition === "loose") {
    // Loose copy value only trusts true loose observations — not boxed retail.
    if (shelfSupportsLooseCondition(shelfType)) return ["loose"];
    return ["used"];
  }

  if (condition === "damaged") {
    if (shelfSupportsLooseCondition(shelfType)) {
      return prices?.priceUsedCIB ? ["cib", "loose", "used"] : ["loose", "used"];
    }
    return ["used"];
  }

  return [];
}
