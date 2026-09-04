import { describe, expect, it } from "vitest";

import {
  belongsOnNarutoPromoChecklist,
  digCollectorForm,
} from "./confirmedCarddassTournamentPromos";

describe("belongsOnNarutoPromoChecklist", () => {
  it("keeps dedicated PR- / OP sequences", () => {
    expect(belongsOnNarutoPromoChecklist("pr011")).toBe(true);
    expect(belongsOnNarutoPromoChecklist("pr0096")).toBe(true);
    expect(belongsOnNarutoPromoChecklist("pr100")).toBe(true);
  });

  it("keeps Collection Naruto tournament reprints from the dig lists", () => {
    expect(belongsOnNarutoPromoChecklist("ni0023-promo")).toBe(true);
    expect(belongsOnNarutoPromoChecklist("te0030-cdf")).toBe(true);
    expect(belongsOnNarutoPromoChecklist("te0002-promo")).toBe(true);
    expect(digCollectorForm("ni0023-promo")).toBe("ni023");
  });

  it("rejects S6 manga/DVD inserts filed as -promo twins", () => {
    expect(belongsOnNarutoPromoChecklist("ni0232-promo")).toBe(false);
    expect(belongsOnNarutoPromoChecklist("ni0236-promo")).toBe(false);
    expect(belongsOnNarutoPromoChecklist("ta0221-promo")).toBe(false);
    expect(belongsOnNarutoPromoChecklist("ta0227-promo")).toBe(false);
    // Retail / insert print itself is not a promo checklist member either.
    expect(belongsOnNarutoPromoChecklist("ni0232")).toBe(false);
  });
});
