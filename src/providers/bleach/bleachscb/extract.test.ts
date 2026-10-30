import { describe, expect, it } from "vitest";

import { selectBleachScbSteps } from "./extract";

describe("selectBleachScbSteps", () => {
  it("defaults to seed + faces + products", () => {
    expect(selectBleachScbSteps([])).toEqual(["seed", "faces", "products"]);
  });

  it("honours --only and --skip", () => {
    expect(selectBleachScbSteps(["--only", "products"])).toEqual(["products"]);
    expect(selectBleachScbSteps(["--skip", "faces"])).toEqual([
      "seed",
      "products",
    ]);
  });

  it("keeps products offline (curated sealed); drops seed/faces", () => {
    expect(selectBleachScbSteps(["--offline"])).toEqual(["products"]);
  });
});
