import { describe, expect, it } from "vitest";

import { selectDbsJccSteps } from "./extract";

describe("selectDbsJccSteps", () => {
  it("defaults to seed + faces + products + documents", () => {
    expect(selectDbsJccSteps([])).toEqual([
      "seed",
      "faces",
      "products",
      "documents",
    ]);
  });

  it("maps --skip-faces alias", () => {
    expect(selectDbsJccSteps(["--skip-faces"])).toEqual([
      "seed",
      "products",
      "documents",
    ]);
  });

  it("honours --offline", () => {
    expect(selectDbsJccSteps(["--offline"])).toEqual(["seed", "products"]);
  });
});
