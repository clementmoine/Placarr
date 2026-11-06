import { describe, expect, it } from "vitest";

import { selectNarutoKayouSteps } from "./extract";

describe("selectNarutoKayouSteps", () => {
  it("defaults to seed + faces + products + documents", () => {
    expect(selectNarutoKayouSteps([])).toEqual([
      "seed",
      "faces",
      "products",
      "documents",
    ]);
  });

  it("maps --titles-only onto faces skip", () => {
    expect(selectNarutoKayouSteps(["--titles-only"])).toEqual([
      "seed",
      "products",
      "documents",
    ]);
  });

  it("honours --only products", () => {
    expect(selectNarutoKayouSteps(["--only", "products"])).toEqual([
      "products",
    ]);
  });
});
