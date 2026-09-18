import { describe, expect, it } from "vitest";

import { mapLorcanaMetadata, toPrintCandidate } from "./index";
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
    artists: [],
    flavorText: null,
    imageUrl: null,
    thumbnailUrl: null,
    foilMaskUrl: null,
    fullFoilUrl: null,
    varnishMaskUrl: null,
    secondVarnishMaskUrl: null,
    foilEffectColors: [],
    cardType: null,
    ...overrides,
  } as LorcanaCard;
}

describe("mapLorcanaMetadata language variants", () => {
  it("stores a cover and title for every language, preferred first", () => {
    const fr = card({
      language: "fr",
      fullName: "Ariel - Sur des jambes humaines",
      imageUrl: "https://example.test/fr.jpg",
      foilMaskUrl: "https://example.test/fr-mask.png",
    });
    const en = card({
      language: "en",
      fullName: "Ariel - On Human Legs",
      imageUrl: "https://example.test/en.jpg",
      foilMaskUrl: "https://example.test/en-mask.png",
    });
    const mapped = mapLorcanaMetadata(fr, [fr, en]);
    expect(mapped?.imageUrl).toBe("https://example.test/fr.jpg");
    expect(mapped?.title).toBe("Ariel - Sur des jambes humaines");
    expect(mapped?.regionalTitles).toEqual([
      { region: "fr", text: "Ariel - Sur des jambes humaines" },
      { region: "en", text: "Ariel - On Human Legs" },
    ]);
    expect(mapped?.aliases).toEqual(["Ariel - On Human Legs"]);
    expect(
      mapped?.attachments
        ?.filter((row) => row.type === "cover")
        .map((row) => row.role),
    ).toEqual(["fr", "en"]);
    expect(
      mapped?.attachments
        ?.filter((row) => row.type === "foilMask")
        .map((row) => row.role),
    ).toEqual(["fr", "en"]);
  });

  it("keeps a single cover when only one language published the print", () => {
    const en = card({
      language: "en",
      fullName: "Ariel - Tempest Print",
      imageUrl: "https://example.test/en-tempest.jpg",
      foilTypes: ["None", "Tempest"],
    });
    const mapped = mapLorcanaMetadata(en, [en]);
    expect(mapped?.imageUrl).toBe("https://example.test/en-tempest.jpg");
    expect(mapped?.attachments?.filter((row) => row.type === "cover")).toEqual([
      expect.objectContaining({
        role: "en",
        url: "https://example.test/en-tempest.jpg",
      }),
    ]);
  });
});

describe("toPrintCandidate varnish", () => {
  it("names every varnish the catalogue actually ships", () => {
    // Taken from the catalogue itself, one representative per distinct
    // (finish, varnish, hot-foil count) combination: 22 of them. `RainbowHotFoil`
    // was missing and fell back to the everyday coat unnoticed.
    for (const [varnish, look] of [
      ["HighGloss", "hotFoil"],
      ["MatteHotFoil", "hotFoil"],
      ["MetallicHotFoil", "hotFoil"],
      ["SnowHotFoil", "hotFoil"],
      ["RainbowHotFoil", "hotFoil"],
      ["ChromeRainbowHotFoil", "chromeRainbowHotFoil"],
    ] as const) {
      expect(
        toPrintCandidate(card({ varnishType: varnish })).varnishShaders,
      ).toEqual({ [varnish]: look });
    }
  });

  it("leaves the hue to foilEffectColors rather than to the varnish name", () => {
    // Two prints with the same varnish throw different colours, so nothing here
    // may claim one. A print upstream says nothing about gets none.
    expect(
      toPrintCandidate(card({ varnishType: "MetallicHotFoil" })).varnishColor,
    ).toBeNull();
    expect(
      toPrintCandidate(
        card({
          varnishType: "MetallicHotFoil",
          foilEffectColors: ["#FF474B", "#B2B2B2"],
          secondVarnishMaskUrl: "https://example.test/v2.jpg",
        }),
      ),
    ).toMatchObject({
      varnishColor: "#FF474B",
      secondVarnishColor: "#B2B2B2",
      secondVarnishMaskUrl: "https://example.test/v2.jpg",
    });
  });

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
  it("tags every print with the Lorcana effect pack", () => {
    expect(toPrintCandidate(card({})).effectPack).toBe("lorcana");
  });

  it("inherits the attested art-facsimile foil mask for Lorcast fill p2-36", () => {
    // p2-36 has no RB mask; MotifMask = greyscale of its own art (not Lilo).
    const candidate = toPrintCandidate(
      card({
        printKey: "lorcana:p2-36",
        fullName: "Mickey Mouse - True Friend",
        foilTypes: ["Glitter"],
        foilMaskUrl: null,
        language: "en",
      }),
    );
    expect(candidate.foilMaskUrl).toBe(
      "/assets/lorcana/cards/p2/en/36/mask.attested.webp",
    );
    expect(candidate.effectPack).toBe("lorcana");
  });

  it("rotates Location prints a quarter turn (localised types)", () => {
    for (const cardType of ["Location", "Lieu", "Ort", "Luogo"]) {
      expect(toPrintCandidate(card({ cardType }))).toMatchObject({
        category: cardType,
        faceQuarterTurns: 1,
      });
    }
    expect(
      toPrintCandidate(card({ cardType: "Personnage" })).faceQuarterTurns,
    ).toBeUndefined();
    expect(toPrintCandidate(card({ cardType: "Character" })).category).toBe(
      "Character",
    );
  });

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
    //
    // This used to be written with `Tempest`, which the library has had a look
    // for all along — the test was asserting a real bug as if it were the
    // intent, and that is why nothing caught it. The example has to be a name
    // the publisher does not ship.
    expect(
      toPrintCandidate(card({ foilTypes: ["Kaleidoscope"] })).finishShaders,
    ).toEqual({});
  });
});

describe("the finish vocabulary", () => {
  /**
   * Every look the library defines must be reachable.
   *
   * The bug this pins was invisible for months: `tempest` and `calendarWave`
   * were transcribed, tested for parity against the publisher's stylesheet, and
   * then never added to the finish table — so both fell through to the everyday
   * silver, and nothing said so. A look nothing maps to is dead weight that
   * looks alive.
   */
  it("draws every finish the publisher ships with its own look", () => {
    for (const [finish, look] of [
      ["Silver", "silver"],
      ["Satin", "satin"],
      ["Lore", "lore"],
      ["Lava", "lava"],
      ["Magma", "magma"],
      ["Glitter", "glitter"],
      ["VerticalWave", "verticalWave"],
      ["SeaWave", "seaWave"],
      ["RainbowPillars", "rainbowPillars"],
      ["FreeForm1", "freeForm"],
      ["FreeForm2", "freeForm"],
      ["Tempest", "tempest"],
      ["CalendarWave", "calendarWave"],
    ] as const) {
      expect(
        toPrintCandidate(card({ foilTypes: ["None", finish] })).finishShaders,
        `${finish} is drawn as something other than ${look}`,
      ).toEqual({ [finish]: look });
    }
  });

  it("leaves a plain copy with no look at all", () => {
    // `None` in either table would hand an ordinary print a foil.
    expect(
      toPrintCandidate(card({ foilTypes: ["None"] })).finishShaders,
    ).toEqual({});
  });

  it("says nothing about a finish it has never seen", () => {
    // Falling back to silver is right for an unknown *print*; claiming a
    // mapping for an unknown *name* would hide the next missing finish.
    expect(
      toPrintCandidate(card({ foilTypes: ["None", "Kaleidoscope"] }))
        .finishShaders,
    ).toEqual({});
  });
});

describe("mapLorcanaMetadata collector facts", () => {
  it("labels Extension + Numéro from the affirmed print (not a name twin)", () => {
    const mapped = mapLorcanaMetadata(
      card({
        printKey: "lorcana:p2-36",
        setCode: "P2",
        setName: "Promo Set 2",
        number: 36,
        promoGrouping: "P2",
        fullName: "Mickey Mouse - True Friend",
        foilTypes: ["Glitter"],
      }),
    );
    expect(mapped?.facts?.find((f) => f.label === "Extension")?.value).toBe(
      "Promo Set 2",
    );
    expect(mapped?.facts?.find((f) => f.label === "Numéro")?.value).toBe(
      "36/P2",
    );
  });
});
