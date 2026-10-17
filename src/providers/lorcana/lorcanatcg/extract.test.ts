import { describe, expect, it } from "vitest";

import { selectLorcanaSteps } from "./extract";

describe("selectLorcanaSteps", () => {
  it("defaults to web + cards + mobile", () => {
    expect(selectLorcanaSteps([])).toEqual(["web", "cards", "mobile"]);
  });

  it("honours --only and --skip", () => {
    expect(selectLorcanaSteps(["--only", "cards"])).toEqual(["cards"]);
    expect(selectLorcanaSteps(["--only", "products,official"])).toEqual([
      "products",
      "official",
    ]);
    expect(selectLorcanaSteps(["--skip", "mobile"])).toEqual([
      "web",
      "cards",
    ]);
  });

  it("keeps products under --offline, drops the rest", () => {
    expect(selectLorcanaSteps(["--offline"])).toEqual([]);
    expect(selectLorcanaSteps(["--only", "cards", "--offline"])).toEqual([]);
    expect(selectLorcanaSteps(["--only", "products", "--offline"])).toEqual([
      "products",
    ]);
  });

  it("maps legacy --providers onto steps", () => {
    expect(
      selectLorcanaSteps([
        "--providers",
        "lorcanacards",
        "lorcanaproducts",
      ]),
    ).toEqual(["cards", "products"]);
  });
});
