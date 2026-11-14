import { describe, expect, it } from "vitest";

import { selectMtgSteps } from "./extract";

describe("selectMtgSteps", () => {
  it("defaults to seed + scryfall-faces + products + documents (shop faces opt-in)", () => {
    expect(selectMtgSteps([])).toEqual([
      "seed",
      "scryfall-faces",
      "products",
      "documents",
    ]);
  });

  it("honours --only and --skip", () => {
    expect(selectMtgSteps(["--only", "seed"])).toEqual(["seed"]);
    expect(selectMtgSteps(["--only", "scryfall-faces"])).toEqual([
      "scryfall-faces",
    ]);
    expect(selectMtgSteps(["--only", "products"])).toEqual(["products"]);
    expect(selectMtgSteps(["--skip", "products"])).toEqual([
      "seed",
      "scryfall-faces",
      "documents",
    ]);
    expect(selectMtgSteps(["--skip", "scryfall-faces"])).toEqual([
      "seed",
      "products",
      "documents",
    ]);
  });

  it("drops online densify/products/documents under --offline", () => {
    expect(selectMtgSteps(["--offline"])).toEqual(["seed"]);
  });

  it("adds shop faces via --mtgcards-faces compat flag", () => {
    expect(selectMtgSteps(["--mtgcards-faces"])).toEqual([
      "seed",
      "scryfall-faces",
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
