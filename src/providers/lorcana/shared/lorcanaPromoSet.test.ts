import { describe, expect, it } from "vitest";

import { lorcanaPromoSetFromGrouping } from "@/providers/lorcana/shared/lorcanaPromoSet";

describe("lorcanaPromoSetFromGrouping", () => {
  it("maps groupings to market promo set codes", () => {
    expect(lorcanaPromoSetFromGrouping("p2")).toBe("P2");
    expect(lorcanaPromoSetFromGrouping("P3")).toBe("P3");
    expect(lorcanaPromoSetFromGrouping("pd1")).toBe("PD1");
    expect(lorcanaPromoSetFromGrouping("d23")).toBe("D23");
    expect(lorcanaPromoSetFromGrouping("cc1")).toBe("CC1");
    expect(lorcanaPromoSetFromGrouping("dis")).toBe("DIS");
    expect(lorcanaPromoSetFromGrouping("c1")).toBe("C1");
    expect(lorcanaPromoSetFromGrouping(null)).toBeNull();
  });
});
