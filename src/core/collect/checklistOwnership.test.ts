import { afterEach, describe, expect, it } from "vitest";

import {
  ownershipSetFromPrintKey,
  registerChecklistOwnershipSet,
  unregisterChecklistOwnershipSet,
} from "./checklistOwnership";
import { checklistSetOwnedKey, isChecklistPrintOwned } from "./checklist";

describe("ownershipSetFromPrintKey", () => {
  afterEach(() => {
    unregisterChecklistOwnershipSet("dummy");
  });

  it("falls back to item setCode then catalogue chapter", () => {
    expect(ownershipSetFromPrintKey("lorcana:13-16", "13")).toBe("13");
    expect(ownershipSetFromPrintKey("lorcana:13-16", null)).toBe("13");
    expect(ownershipSetFromPrintKey("not-a-key", "s5")).toBe("s5");
  });

  it("lets a game resolver override a chapter stamp for promo groupings", () => {
    registerChecklistOwnershipSet("dummy", (identity) =>
      identity.grouping === "p4" ? "p4" : null,
    );
    expect(ownershipSetFromPrintKey("dummy:13-16-p4", "13")).toBe("p4");
    expect(ownershipSetFromPrintKey("dummy:13-16", "13")).toBe("13");
  });
});

describe("Lorcana Promo Year checklist ownership", () => {
  it("ticks p4 / p3 rows when the item still carries the chapter setCode", async () => {
    await import("@/providers/lorcana/lorcanatcg/sources/promoSeries");

    const owned = new Set([
      checklistSetOwnedKey(
        ownershipSetFromPrintKey("lorcana:13-16-p4", "13"),
        "lorcana:13-16-p4",
      ),
      checklistSetOwnedKey(
        ownershipSetFromPrintKey("lorcana:9-34-p3", "9"),
        "lorcana:9-34-p3",
      ),
    ]);

    expect([...owned]).toEqual([
      "p4|lorcana:13-16-p4",
      "p3|lorcana:9-34-p3",
    ]);
    expect(
      isChecklistPrintOwned(
        owned,
        { setId: "p4", printKey: "lorcana:13-16-p4" },
        false,
      ),
    ).toBe(true);
    expect(
      isChecklistPrintOwned(
        owned,
        { setId: "p3", printKey: "lorcana:9-34-p3" },
        false,
      ),
    ).toBe(true);
    expect(
      isChecklistPrintOwned(
        owned,
        { setId: "13", printKey: "lorcana:13-16-p4" },
        false,
      ),
    ).toBe(false);
  });
});
