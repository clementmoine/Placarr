import { describe, expect, it } from "vitest";

import { selectOnepieceSteps } from "./extract";

describe("selectOnepieceSteps", () => {
  it("defaults to seed + faces + products", () => {
    expect(selectOnepieceSteps([])).toEqual(["seed", "faces", "products"]);
  });

  it("honours --only and --skip", () => {
    expect(selectOnepieceSteps(["--only", "products"])).toEqual(["products"]);
    expect(selectOnepieceSteps(["--skip", "faces"])).toEqual([
      "seed",
      "products",
    ]);
  });

  it("keeps all steps under --offline (harvest gated separately)", () => {
    expect(selectOnepieceSteps(["--offline"])).toEqual([
      "seed",
      "faces",
      "products",
    ]);
  });
});
