import { describe, expect, it } from "vitest";

import { selectPokemonSteps } from "./index";

describe("selectPokemonSteps", () => {
  it("defaults to malie → scrape → extract → paper-faces", () => {
    expect(selectPokemonSteps([])).toEqual([
      "malie",
      "scrape",
      "extract",
      "paper-faces",
    ]);
  });

  it("adds products when --products is set", () => {
    expect(selectPokemonSteps(["--products"])).toContain("products");
  });

  it("honours --only and --skip", () => {
    expect(selectPokemonSteps(["--only", "extract"])).toEqual(["extract"]);
    expect(selectPokemonSteps(["--only", "malie,scrape"])).toEqual([
      "malie",
      "scrape",
    ]);
    expect(selectPokemonSteps(["--skip", "paper-faces"])).toEqual([
      "malie",
      "scrape",
      "extract",
    ]);
  });

  it("keeps extract under --offline (local textures)", () => {
    expect(selectPokemonSteps(["--offline"])).toEqual(["extract"]);
    expect(selectPokemonSteps(["--only", "scrape", "--offline"])).toEqual([]);
  });
});
