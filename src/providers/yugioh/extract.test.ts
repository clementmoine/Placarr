import { describe, expect, it } from "vitest";

import { selectYugiohSteps } from "./extract";

describe("selectYugiohSteps", () => {
  it("defaults to seed + faces + products + documents", () => {
    expect(selectYugiohSteps([])).toEqual([
      "seed",
      "faces",
      "products",
      "documents",
    ]);
  });

  it("honours --only and --skip", () => {
    expect(selectYugiohSteps(["--only", "products"])).toEqual(["products"]);
    expect(selectYugiohSteps(["--skip", "faces"])).toEqual([
      "seed",
      "products",
      "documents",
    ]);
  });

  it("maps --skip-faces alias onto faces", () => {
    expect(selectYugiohSteps(["--skip-faces"])).toEqual([
      "seed",
      "products",
      "documents",
    ]);
  });

  it("keeps products under --offline; drops seed/faces/documents", () => {
    expect(selectYugiohSteps(["--offline"])).toEqual(["products"]);
  });
});
