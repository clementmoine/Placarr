import { describe, expect, it } from "vitest";

import { toPrintCandidate } from "./index";
import type { LorcanaCard } from "./fetch";

function card(overrides: Partial<LorcanaCard>): LorcanaCard {
  return {
    printKey: "lorcana:1-42",
    providerId: "42",
    name: "Elsa",
    fullName: "Elsa - Esprit de l'hiver",
    setCode: "1",
    number: 42,
    rarity: "Légendaire",
    language: "fr",
    foilTypes: ["None", "Silver"],
    varnishType: null,
    imageUrl: null,
    thumbnailUrl: null,
    foilMaskUrl: null,
    fullFoilUrl: null,
    varnishMaskUrl: null,
    ...overrides,
  } as LorcanaCard;
}

describe("toPrintCandidate finishes", () => {
  it("gives the Enchanted finishes their own look", () => {
    // An Enchanted print carries no `Silver` at all — its only finish is one of
    // these — which is exactly why it must not shimmer like a common card.
    for (const finish of ["Lava", "Magma", "VerticalWave"]) {
      expect(
        toPrintCandidate(card({ foilTypes: [finish] })).finishShaders,
      ).toEqual({ [finish]: "aurora" });
    }
  });

  it("keeps the everyday foil on the everyday finish", () => {
    // `Silver` is on 2703 prints: whatever else changes, it stays the baseline.
    expect(toPrintCandidate(card({})).finishShaders).toEqual({});
  });

  it("separates the smooth finishes from the toothy ones", () => {
    expect(
      toPrintCandidate(card({ foilTypes: ["Satin"] })).finishShaders,
    ).toEqual({ Satin: "sheen" });
    expect(
      toPrintCandidate(card({ foilTypes: ["Glitter"] })).finishShaders,
    ).toEqual({ Glitter: "sparkle" });
  });

  it("never claims a look for the plain finish", () => {
    // `None` means no foil; giving it a shader would light up a normal copy.
    const candidate = toPrintCandidate(card({ foilTypes: ["None", "Lava"] }));
    expect(candidate.finishShaders).toEqual({ Lava: "aurora" });
    expect(candidate.plainFinishes).toEqual(["None"]);
  });

  it("stays silent on a finish nobody has looked at yet", () => {
    // Silence falls back to the everyday foil downstream, which is honest:
    // the copy is foil, we just have no better word for how.
    expect(
      toPrintCandidate(card({ foilTypes: ["FreeForm1"] })).finishShaders,
    ).toEqual({});
  });
});
