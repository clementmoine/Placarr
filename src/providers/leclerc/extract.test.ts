import { describe, expect, it } from "vitest";

import { selectLeclercSteps } from "./extract";

describe("selectLeclercSteps", () => {
  it("defaults to seed + faces + products", () => {
    expect(selectLeclercSteps([])).toEqual(["seed", "faces", "products"]);
  });

  it("honours --only and --skip", () => {
    expect(selectLeclercSteps(["--only", "seed"])).toEqual(["seed"]);
    expect(selectLeclercSteps(["--skip", "faces"])).toEqual([
      "seed",
      "products",
    ]);
  });

  it("drops online faces under --offline", () => {
    expect(selectLeclercSteps(["--offline"])).toEqual(["seed", "products"]);
  });
});
