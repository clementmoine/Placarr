import { describe, expect, it } from "vitest";

import { selectBleachScbSteps } from "./extract";

describe("selectBleachScbSteps", () => {
  it("defaults to seed + faces + products + documents", () => {
    expect(selectBleachScbSteps([])).toEqual([
      "seed",
      "faces",
      "products",
      "documents",
    ]);
  });

  it("honours --only and --skip", () => {
    expect(selectBleachScbSteps(["--only", "products"])).toEqual(["products"]);
    expect(selectBleachScbSteps(["--skip", "faces"])).toEqual([
      "seed",
      "products",
      "documents",
    ]);
  });

  it("keeps products offline (curated sealed); drops seed/faces/documents", () => {
    expect(selectBleachScbSteps(["--offline"])).toEqual(["products"]);
  });
});
