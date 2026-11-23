import { describe, expect, it } from "vitest";

import { selectLeclercSteps } from "./extract";

describe("selectLeclercSteps", () => {
  it("defaults to ledgers + seed + faces + products + documents", () => {
    expect(selectLeclercSteps([])).toEqual([
      "ledgers",
      "seed",
      "faces",
      "products",
      "documents",
    ]);
  });

  it("honours --only and --skip", () => {
    expect(selectLeclercSteps(["--only", "seed"])).toEqual(["seed"]);
    expect(selectLeclercSteps(["--skip", "faces"])).toEqual([
      "ledgers",
      "seed",
      "products",
      "documents",
    ]);
  });

  it("drops online ledgers + faces + documents under --offline", () => {
    expect(selectLeclercSteps(["--offline"])).toEqual(["seed", "products"]);
  });
});
