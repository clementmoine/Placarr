import { describe, expect, it } from "vitest";

import { selectDbsJccSteps } from "./extract";

describe("selectDbsJccSteps", () => {
  it("defaults to seed + faces + products", () => {
    expect(selectDbsJccSteps([])).toEqual(["seed", "faces", "products"]);
  });

  it("maps --skip-faces alias", () => {
    expect(selectDbsJccSteps(["--skip-faces"])).toEqual([
      "seed",
      "products",
    ]);
  });

  it("honours --offline", () => {
    expect(selectDbsJccSteps(["--offline"])).toEqual(["seed", "products"]);
  });
});
