import { describe, expect, it } from "vitest";

import { selectYugiohSteps } from "./extract";

describe("selectYugiohSteps", () => {
  it("defaults to seed + faces + products", () => {
    expect(selectYugiohSteps([])).toEqual(["seed", "faces", "products"]);
  });

  it("honours --only and --skip", () => {
    expect(selectYugiohSteps(["--only", "products"])).toEqual(["products"]);
    expect(selectYugiohSteps(["--skip", "faces"])).toEqual([
      "seed",
      "products",
    ]);
  });

  it("maps --skip-faces alias onto faces", () => {
    expect(selectYugiohSteps(["--skip-faces"])).toEqual([
      "seed",
      "products",
    ]);
  });

  it("keeps products under --offline; drops seed/faces", () => {
    expect(selectYugiohSteps(["--offline"])).toEqual(["products"]);
  });
});
