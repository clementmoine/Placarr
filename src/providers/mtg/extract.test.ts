import { describe, expect, it } from "vitest";

import { selectMtgSteps } from "./extract";

describe("selectMtgSteps", () => {
  it("defaults to seed + products + documents (faces opt-in)", () => {
    expect(selectMtgSteps([])).toEqual(["seed", "products", "documents"]);
  });

  it("honours --only and --skip", () => {
    expect(selectMtgSteps(["--only", "seed"])).toEqual(["seed"]);
    expect(selectMtgSteps(["--only", "products"])).toEqual(["products"]);
    expect(selectMtgSteps(["--skip", "products"])).toEqual([
      "seed",
      "documents",
    ]);
  });

  it("drops online faces/products/documents under --offline", () => {
    expect(selectMtgSteps(["--offline"])).toEqual(["seed"]);
  });

  it("adds faces via --mtgcards-faces compat flag", () => {
    expect(selectMtgSteps(["--mtgcards-faces"])).toEqual([
      "seed",
      "products",
      "documents",
      "faces",
    ]);
  });

  it("does not add faces when --offline", () => {
    expect(selectMtgSteps(["--offline", "--mtgcards-faces"])).toEqual([
      "seed",
    ]);
  });
});
