import { describe, expect, it } from "vitest";

import { selectOnepieceSteps } from "./extract";

describe("selectOnepieceSteps", () => {
  it("defaults to seed + faces + products + documents", () => {
    expect(selectOnepieceSteps([])).toEqual([
      "seed",
      "faces",
      "products",
      "documents",
    ]);
  });

  it("honours --only and --skip", () => {
    expect(selectOnepieceSteps(["--only", "products"])).toEqual(["products"]);
    expect(selectOnepieceSteps(["--skip", "faces"])).toEqual([
      "seed",
      "products",
      "documents",
    ]);
  });

  it("drops online documents under --offline", () => {
    expect(selectOnepieceSteps(["--offline"])).toEqual([
      "seed",
      "faces",
      "products",
    ]);
  });
});
