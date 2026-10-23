import { describe, expect, it } from "vitest";

import { selectNarutoMythosSteps } from "./extract";

describe("selectNarutoMythosSteps", () => {
  it("defaults to seed + faces + products", () => {
    expect(selectNarutoMythosSteps([])).toEqual(["seed", "faces", "products"]);
  });

  it("maps --titles-only onto faces skip", () => {
    expect(selectNarutoMythosSteps(["--titles-only"])).toEqual([
      "seed",
      "products",
    ]);
  });

  it("honours --offline", () => {
    expect(selectNarutoMythosSteps(["--offline"])).toEqual([
      "seed",
      "products",
    ]);
  });
});
