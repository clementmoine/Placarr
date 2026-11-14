import { describe, expect, it } from "vitest";

import { selectNarutoRanksSteps } from "./extract";

describe("selectNarutoRanksSteps", () => {
  it("defaults to seed + faces + products", () => {
    expect(selectNarutoRanksSteps([])).toEqual(["seed", "faces", "products"]);
  });

  it("honours --only / --skip / --offline", () => {
    expect(selectNarutoRanksSteps(["--only", "products"])).toEqual([
      "products",
    ]);
    expect(selectNarutoRanksSteps(["--skip", "faces"])).toEqual([
      "seed",
      "products",
    ]);
    expect(selectNarutoRanksSteps(["--offline"])).toEqual([
      "seed",
      "products",
    ]);
  });
});
