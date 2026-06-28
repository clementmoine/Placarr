import { describe, expect, it } from "vitest";

import { isChasseTitleAligned } from "./index";

describe("isChasseTitleAligned", () => {
  it("refuse un resultat qui perd le numero explicitement demande", () => {
    expect(
      isChasseTitleAligned("super picsou geant n 1", "Super picsou géant"),
    ).toBe(false);
  });

  it("refuse un tome arbitraire quand la recherche ne demande pas de volume", () => {
    expect(
      isChasseTitleAligned(
        "Fullmetal Alchemist",
        "FullMetal Alchemist - Tome 17",
      ),
    ).toBe(false);
  });

  it("accepte un titre enrichi sans volume arbitraire", () => {
    expect(
      isChasseTitleAligned(
        "L'art et la création de Arcane",
        "L'art Et La Création De Arcane - League Of Legends",
      ),
    ).toBe(true);
  });
});
