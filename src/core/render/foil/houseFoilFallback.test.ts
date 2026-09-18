import { describe, expect, it } from "vitest";

import {
  applyHouseFoilFallback,
  HOUSE_FOIL_FALLBACK_CSS_ID,
} from "./houseFoilFallback";

describe("applyHouseFoilFallback", () => {
  it("keeps a dedicated look", () => {
    expect(applyHouseFoilFallback("rainbowFoil", "Rainbow")).toBe(
      "rainbowFoil",
    );
    expect(applyHouseFoilFallback("silver", "Silver")).toBe("silver");
  });

  it("falls back to house flare when shiny but no look", () => {
    expect(applyHouseFoilFallback(null, "holo")).toBe(
      HOUSE_FOIL_FALLBACK_CSS_ID,
    );
    expect(applyHouseFoilFallback("", "SomeFutureLeaf")).toBe("flare");
  });

  it("stays flat for empty / None", () => {
    expect(applyHouseFoilFallback(null, null)).toBeNull();
    expect(applyHouseFoilFallback(null, "")).toBeNull();
    expect(applyHouseFoilFallback(null, "None")).toBeNull();
  });
});
