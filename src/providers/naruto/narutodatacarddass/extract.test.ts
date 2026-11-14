import { describe, expect, it } from "vitest";

import { selectNarutoDataCarddassSteps } from "./extract";

describe("selectNarutoDataCarddassSteps", () => {
  it("defaults to seed + faces + products + documents", () => {
    expect(selectNarutoDataCarddassSteps([])).toEqual([
      "seed",
      "faces",
      "products",
      "documents",
    ]);
  });

  it("honours --only / --skip / --offline", () => {
    expect(selectNarutoDataCarddassSteps(["--only", "products"])).toEqual([
      "products",
    ]);
    expect(selectNarutoDataCarddassSteps(["--skip", "faces"])).toEqual([
      "seed",
      "products",
      "documents",
    ]);
    expect(selectNarutoDataCarddassSteps(["--offline"])).toEqual([
      "seed",
      "products",
      "documents",
    ]);
  });
});
