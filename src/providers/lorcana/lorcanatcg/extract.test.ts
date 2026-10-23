import { describe, expect, it } from "vitest";

import { selectLorcanaSteps } from "./extract";

describe("selectLorcanaSteps", () => {
  it("defaults to web + cards + products + mobile", () => {
    expect(selectLorcanaSteps([])).toEqual([
      "web",
      "cards",
      "products",
      "mobile",
    ]);
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
      "products",
    ]);
  });

  it("keeps products under --offline, drops the rest", () => {
    // `products` can reuse on-disk lorcards staging; other defaults need net.
    expect(selectLorcanaSteps(["--offline"])).toEqual(["products"]);
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
