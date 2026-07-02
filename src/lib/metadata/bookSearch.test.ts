import { describe, expect, it } from "vitest";

import { buildBookMetadataSearchQueries } from "./bookSearch";
import { retailerSearchQueryUsesOnlyInputTokens } from "../retailer/metadataLookup";

describe("buildBookMetadataSearchQueries", () => {
  it("garde le titre brut en premier et ajoute le nom d'étagère quand utile", () => {
    expect(buildBookMetadataSearchQueries("Naruto n°01", "Mangas")).toEqual([
      "Naruto n°01",
      "Mangas Naruto n°01",
    ]);
  });

  it("n'ajoute pas l'étagère si déjà présente dans le titre", () => {
    expect(buildBookMetadataSearchQueries("Manga Naruto n°01", "Mangas")).toEqual([
      "Manga Naruto n°01",
    ]);
  });

  it("ne fabrique que des requêtes composées du titre et de l'étagère", () => {
    for (const query of buildBookMetadataSearchQueries(
      "Dragon Ball n°01",
      "Mangas",
    )) {
      expect(
        retailerSearchQueryUsesOnlyInputTokens(
          query,
          "Dragon Ball n°01",
          "Mangas",
        ),
      ).toBe(true);
    }
  });
});
