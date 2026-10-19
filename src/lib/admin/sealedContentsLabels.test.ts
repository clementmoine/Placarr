import { describe, expect, it } from "vitest";

import {
  formatRandomPoolScopeLabel,
  formatSealedRandomContentsLabel,
  formatSealedStructureUnitLabel,
} from "./sealedContentsLabels";

describe("formatSealedRandomContentsLabel", () => {
  it("phrases a single set-pool pack in French", () => {
    expect(
      formatSealedRandomContentsLabel(
        { packs: 1, cardsPerPack: 12, pool: "set", setId: "12" },
        true,
      ),
    ).toBe("1 sachet de 12 cartes tirées au hasard dans le set 12");
  });

  it("phrases a display of set-pool packs in English", () => {
    expect(
      formatSealedRandomContentsLabel(
        { packs: 24, cardsPerPack: 12, pool: "set" },
        false,
      ),
    ).toBe("24 packs of 12 cards drawn at random from the set");
  });

  it("phrases an unknown pool without jargon", () => {
    expect(
      formatSealedRandomContentsLabel(
        { packs: 1, cardsPerPack: 12, pool: "unknown" },
        true,
      ),
    ).toBe("1 sachet de 12 cartes (origine du tirage inconnue)");
  });
});

describe("formatSealedStructureUnitLabel", () => {
  it("keeps the unit name and size readable", () => {
    expect(
      formatSealedStructureUnitLabel(
        { count: 2, cardsEach: 30, label: "Starting deck" },
        true,
      ),
    ).toBe(
      "2 × Starting deck · 30 cartes chacune (listes à inventarier)",
    );
  });
});

describe("formatRandomPoolScopeLabel", () => {
  it("replaces raw scope tokens", () => {
    expect(formatRandomPoolScopeLabel("none", null, true)).toBe(
      "aucune au niveau de ce produit",
    );
    expect(formatRandomPoolScopeLabel("set", "12", true)).toBe(
      "cartes au hasard du set 12",
    );
  });
});
