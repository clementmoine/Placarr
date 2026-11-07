import { describe, expect, it } from "vitest";

import {
  cataloguePokemonPriceLookupKey,
  liveBundleIdToPokemonPrintKey,
  preferPokemonCatalogueStem,
  pkmcardsTileToPrintKey,
} from "./index";

describe("liveBundleIdToPokemonPrintKey", () => {
  it("maps Catalogue Live bundle ids to pokemon printKeys", () => {
    expect(liveBundleIdToPokemonPrintKey("me5_fr_001")).toBe("pokemon:me05-001");
    expect(liveBundleIdToPokemonPrintKey("bw10_en_005")).toBe(
      "pokemon:bw10-005",
    );
    expect(liveBundleIdToPokemonPrintKey("sv03.5_fr_006")).toBe(
      "pokemon:sv03.5-006",
    );
  });

  it("returns null for real printKeys and junk", () => {
    expect(liveBundleIdToPokemonPrintKey("pokemon:me5-001")).toBeNull();
    expect(liveBundleIdToPokemonPrintKey("")).toBeNull();
  });
});

describe("cataloguePokemonPriceLookupKey", () => {
  it("passes through pokemon: printKeys", () => {
    expect(cataloguePokemonPriceLookupKey("pokemon:me5-001")).toBe(
      "pokemon:me5-001",
    );
  });

  it("normalises Live bundle Catalogue keys", () => {
    expect(cataloguePokemonPriceLookupKey("me5_fr_001")).toBe(
      "pokemon:me05-001",
    );
  });
});

describe("preferPokemonCatalogueStem", () => {
  it("maps Live me5 onto Catalogue me05 when that set is indexed", () => {
    expect(preferPokemonCatalogueStem("me5")).toBe("me05");
    expect(preferPokemonCatalogueStem("me05")).toBe("me05");
  });
});

describe("pkmcardsTileToPrintKey", () => {
  it("maps a Nuit Noire tile onto the Catalogue stem", () => {
    expect(
      pkmcardsTileToPrintKey({
        slug: "pbl-fr-001-mega-evolution-nuit-noire-tropius",
      }),
    ).toBe("pokemon:me05-001");
  });
});
