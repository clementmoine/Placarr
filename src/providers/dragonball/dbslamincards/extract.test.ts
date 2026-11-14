import { describe, expect, it } from "vitest";

import { selectDbsLamincardsSteps } from "./extract";

describe("selectDbsLamincardsSteps", () => {
  it("defaults to seed + faces + products", () => {
    expect(selectDbsLamincardsSteps([])).toEqual([
      "seed",
      "faces",
      "products",
    ]);
  });

  it("honours --only / --skip / --offline", () => {
    expect(selectDbsLamincardsSteps(["--only", "products"])).toEqual([
      "products",
    ]);
    expect(selectDbsLamincardsSteps(["--skip", "faces"])).toEqual([
      "seed",
      "products",
    ]);
    expect(selectDbsLamincardsSteps(["--offline"])).toEqual([
      "seed",
      "products",
    ]);
  });
});
