import { describe, expect, it } from "vitest";

import { selectLeclercSteps } from "./extract";

describe("selectLeclercSteps", () => {
  it("defaults to seed + faces + products + documents", () => {
    expect(selectLeclercSteps([])).toEqual([
      "seed",
      "faces",
      "products",
      "documents",
    ]);
  });

  it("honours --only and --skip", () => {
    expect(selectLeclercSteps(["--only", "seed"])).toEqual(["seed"]);
    expect(selectLeclercSteps(["--skip", "faces"])).toEqual([
      "seed",
      "products",
      "documents",
    ]);
  });

  it("drops online faces + documents under --offline", () => {
    expect(selectLeclercSteps(["--offline"])).toEqual(["seed", "products"]);
  });
});
