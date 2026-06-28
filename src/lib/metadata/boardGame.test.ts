import { describe, expect, it } from "vitest";

import {
  buildBoardGameMetadataSearchQueries,
  bundleTitlePartsMatchCatalogTitle,
  formatBoardGamePlayerCount,
  normalizeBoardGamePlayerCount,
} from "./boardGame";
import { retailerSearchQueryUsesOnlyInputTokens } from "../retailer/metadataLookup";

describe("boardGamePlayers", () => {
  it("formate un intervalle de joueurs en français", () => {
    expect(formatBoardGamePlayerCount("3", "5")).toBe("3 à 5");
    expect(formatBoardGamePlayerCount("2", "2")).toBe("2");
  });

  it("normalise les tirets vers un intervalle français", () => {
    expect(normalizeBoardGamePlayerCount("3-5")).toBe("3 à 5");
    expect(normalizeBoardGamePlayerCount("3 à 4")).toBe("3 à 4");
  });
});

describe("buildBoardGameMetadataSearchQueries", () => {
  it("keeps the raw name first and derives bundle queries from shelf + parts", () => {
    expect(
      buildBoardGameMetadataSearchQueries(
        "La Petite Fille + La Maison du Lac",
        "Escape Room",
      ),
    ).toEqual([
      "La Petite Fille + La Maison du Lac",
      "La Petite Fille La Maison du Lac",
      "La Petite Fille/La Maison du Lac",
      "Escape Room La Petite Fille + La Maison du Lac",
      "Escape Room La Petite Fille La Maison du Lac",
      "Escape Room La Petite Fille/La Maison du Lac",
      "Escape Room",
    ]);
  });

  it("prefixes a single title with the shelf name when missing", () => {
    expect(
      buildBoardGameMetadataSearchQueries("Horreur", "Escape Room"),
    ).toEqual(["Horreur", "Escape Room Horreur"]);
  });

  it("does not expand unrelated shelves", () => {
    expect(buildBoardGameMetadataSearchQueries("Catan", "Jeux de société")).toEqual(
      ["Catan", "Jeux de société Catan"],
    );
  });

  it("only uses tokens from the item title and shelf name", () => {
    const queries = buildBoardGameMetadataSearchQueries(
      "La Petite Fille + La Maison du Lac",
      "Escape Room",
    );
    for (const query of queries) {
      expect(
        retailerSearchQueryUsesOnlyInputTokens(
          query,
          "La Petite Fille + La Maison du Lac",
          "Escape Room",
        ),
      ).toBe(true);
    }
  });

  it("skips shelf prefix when the title already contains it", () => {
    expect(
      buildBoardGameMetadataSearchQueries("Escape Room Horreur", "Escape Room"),
    ).toEqual(["Escape Room Horreur"]);
  });
});

describe("bundleTitlePartsMatchCatalogTitle", () => {
  it("accepts catalog titles that contain each bundle scenario", () => {
    expect(
      bundleTitlePartsMatchCatalogTitle(
        "La Petite Fille + La Maison du Lac",
        "Escape Room - 2 Joueurs - La Petite Fille/La Maison du Lac",
      ),
    ).toBe(true);
  });

  it("accepts retailer listing aliases when the canonical title omits scenarios", () => {
    expect(
      bundleTitlePartsMatchCatalogTitle(
        "La Petite Fille + La Maison du Lac",
        "Escape Room - 2 Joueurs - Horreur",
        ["Escape Room Le Jeu - 2 Joueurs - Petite Fille + Maison du Lac"],
      ),
    ).toBe(true);
  });

  it("rejects unrelated catalog titles", () => {
    expect(
      bundleTitlePartsMatchCatalogTitle(
        "La Maison du Lac",
        "La Maison des Souris",
      ),
    ).toBe(false);
  });
});
