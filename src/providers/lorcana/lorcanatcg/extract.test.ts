import { describe, expect, it } from "vitest";

import { selectLorcanaSteps } from "./extract";

describe("selectLorcanaSteps", () => {
  it("defaults to web + cards + products + mobile + index + documents", () => {
    expect(selectLorcanaSteps([])).toEqual([
      "web",
      "cards",
      "products",
      "mobile",
      "index",
      "documents",
    ]);
  });

  it("honours --only and --skip", () => {
    expect(selectLorcanaSteps(["--only", "cards"])).toEqual(["cards"]);
    expect(selectLorcanaSteps(["--only", "products,official"])).toEqual([
      "products",
      "official",
    ]);
    expect(selectLorcanaSteps(["--only", "index"])).toEqual(["index"]);
    expect(selectLorcanaSteps(["--skip", "mobile"])).toEqual([
      "web",
      "cards",
      "products",
      "index",
      "documents",
    ]);
  });

  it("keeps products + index under --offline, drops online steps", () => {
    // `products` reuses on-disk lorcards staging; `index` hashes local faces.
    expect(selectLorcanaSteps(["--offline"])).toEqual(["products", "index"]);
    expect(selectLorcanaSteps(["--only", "cards", "--offline"])).toEqual([]);
    expect(selectLorcanaSteps(["--only", "products", "--offline"])).toEqual([
      "products",
    ]);
    expect(selectLorcanaSteps(["--only", "index", "--offline"])).toEqual([
      "index",
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
