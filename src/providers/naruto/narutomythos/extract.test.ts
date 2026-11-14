import { describe, expect, it } from "vitest";

import { selectNarutoMythosSteps } from "./extract";

describe("selectNarutoMythosSteps", () => {
  it("defaults to seed + faces + documents + products", () => {
    expect(selectNarutoMythosSteps([])).toEqual([
      "seed",
      "faces",
      "documents",
      "products",
    ]);
  });

  it("maps --titles-only onto faces skip", () => {
    expect(selectNarutoMythosSteps(["--titles-only"])).toEqual([
      "seed",
      "documents",
      "products",
    ]);
  });

  it("honours --offline", () => {
    expect(selectNarutoMythosSteps(["--offline"])).toEqual([
      "seed",
      "documents",
      "products",
    ]);
  });
});
