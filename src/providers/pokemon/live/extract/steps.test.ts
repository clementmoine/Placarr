import { describe, expect, it } from "vitest";

import { selectPokemonSteps } from "./index";

describe("selectPokemonSteps", () => {
  it("defaults to the full Sync surface", () => {
    expect(selectPokemonSteps([])).toEqual([
      "malie",
      "scrape",
      "extract",
      "paper-faces",
      "products",
    ]);
  });

  it("honours --only and --skip (resume / checkpoint)", () => {
    expect(selectPokemonSteps(["--only", "extract"])).toEqual(["extract"]);
    expect(selectPokemonSteps(["--only", "malie,scrape"])).toEqual([
      "malie",
      "scrape",
    ]);
    expect(selectPokemonSteps(["--skip", "paper-faces"])).toEqual([
      "malie",
      "scrape",
      "extract",
      "products",
    ]);
  });

  it("keeps extract under --offline (local textures)", () => {
    expect(selectPokemonSteps(["--offline"])).toEqual(["extract"]);
    expect(selectPokemonSteps(["--only", "scrape", "--offline"])).toEqual([]);
  });
});
