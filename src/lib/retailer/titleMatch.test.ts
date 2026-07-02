import { describe, expect, it } from "vitest";

import { isNameOnlyRetailerTitleMatch } from "./titleMatch";

describe("isNameOnlyRetailerTitleMatch", () => {
  it("accepte un titre quasi identique", () => {
    expect(isNameOnlyRetailerTitleMatch("Catan", "Catan")).toBe(true);
  });

  it("rejette La Maison du Lac vs La Maison des Souris", () => {
    expect(
      isNameOnlyRetailerTitleMatch(
        "La Maison du Lac",
        "La Maison des Souris",
      ),
    ).toBe(false);
  });

  it("rejette La Maison du Lac vs Ma Maison", () => {
    expect(isNameOnlyRetailerTitleMatch("La Maison du Lac", "Ma Maison")).toBe(
      false,
    );
  });

  it("accepte les couleurs FR/EN équivalentes", () => {
    expect(isNameOnlyRetailerTitleMatch("Pokemon Jaune", "Pokemon Yellow")).toBe(
      true,
    );
  });

  it("rejette un sequel retailer (Part I vs Part II)", () => {
    expect(
      isNameOnlyRetailerTitleMatch(
        "The Last of Us Part I",
        "The Last of Us Part II PS4",
      ),
    ).toBe(false);
  });

  it("rejette Little Nightmares II quand seul le premier opus est demandé", () => {
    expect(
      isNameOnlyRetailerTitleMatch(
        "Little Nightmares",
        "Little Nightmares II PS4",
      ),
    ).toBe(false);
    expect(
      isNameOnlyRetailerTitleMatch(
        "Little Nightmares",
        "Little Nightmares PS4",
      ),
    ).toBe(true);
  });

  it("rejette Borderlands 3 quand Borderlands 1 GOTY est demandé", () => {
    expect(
      isNameOnlyRetailerTitleMatch(
        "Borderlands 1 - Game of the Year edition",
        "Borderlands 3 [Deluxe Edition]",
      ),
    ).toBe(false);
    expect(
      isNameOnlyRetailerTitleMatch(
        "Borderlands 1",
        "Borderlands 3 PS4",
      ),
    ).toBe(false);
  });
});
