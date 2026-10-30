import { describe, expect, it } from "vitest";

import { selectNarutoUltraSteps } from "./extract";

describe("selectNarutoUltraSteps", () => {
  it("defaults to seed + faces + products", () => {
    expect(selectNarutoUltraSteps([])).toEqual(["seed", "faces", "products"]);
  });

  it("honours --only / --skip / --offline", () => {
    expect(selectNarutoUltraSteps(["--only", "seed"])).toEqual(["seed"]);
    expect(selectNarutoUltraSteps(["--skip", "faces"])).toEqual([
      "seed",
      "products",
    ]);
    expect(selectNarutoUltraSteps(["--offline"])).toEqual([
      "seed",
      "products",
    ]);
  });
});
