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

describe("toPrintCandidate varnish", () => {
  it("gives the stamped hot foil its own look, apart from a clear coat", () => {
    // Treating all five varnish names as one pale sheen made the hot-foiled
    // line work — the whole point of an Iconique card — look like gloss.
    expect(
      toPrintCandidate(card({ varnishType: "MetallicHotFoil" })).varnishShaders,
    ).toEqual({ MetallicHotFoil: "hotFoil" });
    expect(
      toPrintCandidate(card({ varnishType: "HighGloss" })).varnishShaders,
    ).toEqual({ HighGloss: "hotFoil" });
  });

  it("gives the one named for a spectrum a spectrum", () => {
    expect(
      toPrintCandidate(card({ varnishType: "ChromeRainbowHotFoil" }))
        .varnishShaders,
    ).toEqual({ ChromeRainbowHotFoil: "chromeRainbowHotFoil" });
  });

  it("claims nothing for a print with no varnish", () => {
    expect(toPrintCandidate(card({})).varnishShaders).toEqual({});
    expect(toPrintCandidate(card({})).varnishType).toBeNull();
  });
});

describe("toPrintCandidate finishes", () => {
  it("gives the Enchanted finishes their own look", () => {
    // An Enchanted print carries no `Silver` at all — its only finish is one of
    // these — which is exactly why it must not shimmer like a common card.
    const LOOKS: Record<string, string> = {
      Lava: "lava",
      Magma: "magma",
      VerticalWave: "verticalWave",
    };
    for (const finish of ["Lava", "Magma", "VerticalWave"]) {
      expect(
        toPrintCandidate(card({ foilTypes: [finish] })).finishShaders,
      ).toEqual({ [finish]: LOOKS[finish] });
    }
  });

  it("draws the everyday finish as the metal it is named after", () => {
    // `Silver` is on 2703 prints. It used to render as a rainbow, which made
    // every common card look like the rarest ones.
    expect(toPrintCandidate(card({})).finishShaders).toEqual({
      Silver: "silver",
    });
  });

  it("keeps the spectrum for the finish that really is one", () => {
    expect(
      toPrintCandidate(card({ foilTypes: ["RainbowPillars"] })).finishShaders,
    ).toEqual({ RainbowPillars: "rainbowPillars" });
  });

  it("gives the Iconique line its own showpiece look", () => {
    // `Lore` is on ten prints in the whole game, all hot-foiled. Sharing
    // `sheen` with Satin made the rarest cards the dullest on the shelf.
    expect(
      toPrintCandidate(card({ foilTypes: ["Lore"] })).finishShaders,
    ).toEqual({ Lore: "lore" });
  });

  it("separates the smooth finishes from the toothy ones", () => {
    expect(
      toPrintCandidate(card({ foilTypes: ["Satin"] })).finishShaders,
    ).toEqual({ Satin: "satin" });
    expect(
      toPrintCandidate(card({ foilTypes: ["Glitter"] })).finishShaders,
    ).toEqual({ Glitter: "glitter" });
  });

  it("never claims a look for the plain finish", () => {
    // `None` means no foil; giving it a shader would light up a normal copy.
    const candidate = toPrintCandidate(card({ foilTypes: ["None", "Lava"] }));
    expect(candidate.finishShaders).toEqual({ Lava: "lava" });
    expect(candidate.plainFinishes).toEqual(["None"]);
  });

  it("stays silent on a finish nobody has looked at yet", () => {
    // Silence falls back to the everyday foil downstream, which is honest:
    // the copy is foil, we just have no better word for how.
    expect(
      toPrintCandidate(card({ foilTypes: ["Tempest"] })).finishShaders,
    ).toEqual({});
  });
});
