import { describe, expect, it } from "vitest";

import { selectDbhSteps } from "./extract";

describe("selectDbhSteps", () => {
  it("defaults to scrape + seed + faces + products", () => {
    expect(selectDbhSteps([])).toEqual([
      "scrape",
      "seed",
      "faces",
      "products",
    ]);
  });

  it("honours --only and --skip", () => {
    expect(selectDbhSteps(["--only", "products"])).toEqual(["products"]);
    expect(selectDbhSteps(["--skip", "faces,scrape"])).toEqual([
      "seed",
      "products",
    ]);
  });

  it("maps legacy --skip-scrape / --skip-faces", () => {
    expect(selectDbhSteps(["--skip-scrape", "--skip-faces"])).toEqual([
      "seed",
      "products",
    ]);
  });

  it("drops scrape/faces under --offline", () => {
    expect(selectDbhSteps(["--offline"])).toEqual(["seed", "products"]);
  });
});
