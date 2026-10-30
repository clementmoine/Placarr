import { describe, expect, it } from "vitest";

import {
  formatPackCompositionPossibleChaseLabel,
  formatPackCompositionProvenanceLabel,
  formatPackCompositionSlotLabel,
  formatSealedKindLine,
  formatSealedPackCountLabel,
  formatSealedRandomContentsLabel,
  formatSealedRandomSectionTitle,
} from "./sealedContentsLabels";

describe("sealedContentsLabels", () => {
  it("pluralises pochette / sachet without sachet(s)", () => {
    expect(formatSealedPackCountLabel(1, true, "pochette")).toBe("1 pochette");
    expect(formatSealedPackCountLabel(2, true, "pochette")).toBe("2 pochettes");
    expect(formatSealedPackCountLabel(1, true, "booster")).toBe("1 sachet");
    expect(formatSealedPackCountLabel(3, true, "booster")).toBe("3 sachets");
  });

  it("humanises structural provenance and dedicated card slots", () => {
    expect(formatPackCompositionProvenanceLabel("structural", true)).toBe(
      "structure connue",
    );
    expect(
      formatPackCompositionSlotLabel(
        { id: "card", count: 4, rarities: ["card"] },
        true,
      ),
    ).toBe("4 cartes");
  });

  it("labels optional chase outside counted cards", () => {
    expect(formatPackCompositionPossibleChaseLabel(["Fixeez"], true)).toBe(
      "Fixeez : possible (aléatoire, non garanti — hors des cartes comptées)",
    );
  });

  it("labels pochette kind line and section title", () => {
    expect(
      formatSealedKindLine({
        kindLabel: "Booster",
        setCode: "disney25",
        slug: "pochette",
        fr: true,
      }),
    ).toBe("Pochette · disney25");
    expect(formatSealedRandomSectionTitle(true, "pochette")).toBe(
      "Pochettes / tirages",
    );
  });

  it("uses pochette in random-contents summary", () => {
    expect(
      formatSealedRandomContentsLabel(
        {
          packs: 1,
          cardsPerPack: 4,
          pool: "set",
          setId: "disney25",
          slug: "pochette",
        },
        true,
      ),
    ).toBe("1 pochette de 4 cartes tirées au hasard dans le set disney25");
  });
});
