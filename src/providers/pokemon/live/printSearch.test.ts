import { describe, expect, it } from "vitest";

import { listTcgdexLocalSets } from "@/providers/pokemon/tcgdex/indexStore";

import { pokemontcgliveModule } from "./index";
import {
  listPokemonLivePrintSets,
  lookupPokemonLivePrint,
  searchPokemonLivePrints,
} from "./printSearch";

const hasLocalCatalogue = listTcgdexLocalSets().length > 0;

describe("pokemontcglive print surface", () => {
  it("exposes search / lookup / sets on the dataPack owner", () => {
    expect(pokemontcgliveModule.searchPrints).toBeTypeOf("function");
    expect(pokemontcgliveModule.lookupPrint).toBeTypeOf("function");
    expect(pokemontcgliveModule.listPrintSets).toBeTypeOf("function");
    expect(pokemontcgliveModule.listSetPrints).toBeTypeOf("function");
    expect(pokemontcgliveModule.printGames).toEqual(["pokemon"]);
    expect(pokemontcgliveModule.catalog?.dataPack).toBe("pokemon");
  });

  it("does not claim foreign printKeys", () => {
    expect(lookupPokemonLivePrint("lorcana:1-1")).toBeNull();
    expect(lookupPokemonLivePrint("naruto:nr-0001")).toBeNull();
  });

  it.skipIf(!hasLocalCatalogue)(
    "searches the TCGdex identity corpus for a set",
    () => {
      const sets = listPokemonLivePrintSets("fr");
      expect(sets.length).toBeGreaterThan(0);
      const found = searchPokemonLivePrints("", {
        setId: sets[0]!.id,
        language: "fr",
        limit: 3,
      });
      expect(found.length).toBeGreaterThan(0);
      expect(found.every((row) => row.printKey.startsWith("pokemon:"))).toBe(
        true,
      );
      const hit = lookupPokemonLivePrint(found[0]!.printKey, "fr");
      expect(hit?.printKey).toBe(found[0]!.printKey);
    },
  );
});
