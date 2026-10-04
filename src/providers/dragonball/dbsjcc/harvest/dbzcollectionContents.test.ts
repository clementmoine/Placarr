import { describe, expect, it } from "vitest";

import { normalizeDbzcDistributionChannel } from "./dbzcollectionContents";

describe("normalizeDbzcDistributionChannel", () => {
  it("maps booster / shared / themed decks", () => {
    expect(normalizeDbzcDistributionChannel("Booster", "part1")).toBe(
      "booster",
    );
    expect(normalizeDbzcDistributionChannel("Deck", "part1")).toBe(
      "deck:shared:part1",
    );
    expect(normalizeDbzcDistributionChannel("Deck ennemis", "part1")).toBe(
      "deck:ennemis:part1",
    );
    expect(normalizeDbzcDistributionChannel("Deck saiyans", "part1")).toBe(
      "deck:super-saiyans:part1",
    );
    expect(normalizeDbzcDistributionChannel("Deck super saiyan", "part1")).toBe(
      "deck:super-saiyans:part1",
    );
    expect(
      normalizeDbzcDistributionChannel("Deck ennemis et saiyans", "part1"),
    ).toBe("deck:shared:part1");
    expect(
      normalizeDbzcDistributionChannel("Deck l'éveil de gohan", "part2"),
    ).toBe("deck:eveil-de-gohan:part2");
    expect(normalizeDbzcDistributionChannel("Deck ruban rouge", "part2")).toBe(
      "deck:ruban-rouge:part2",
    );
    expect(
      normalizeDbzcDistributionChannel("Deck résistance et planète", "part5"),
    ).toBe("deck:shared:part5");
    expect(
      normalizeDbzcDistributionChannel("Starter nouvelle épreuve", "part8"),
    ).toBe("deck:nouvelle-epreuve:part8");
    expect(normalizeDbzcDistributionChannel("Deck résistence", "part5")).toBe(
      "deck:resistance:part5",
    );
  });
});
