import { describe, expect, it } from "vitest";

import type { LorcanaCard } from "./fetch";
import {
  cardHasFinish,
  pickLorcanaPlayroomSamples,
} from "./playroomSamples";

function card(overrides: Partial<LorcanaCard>): LorcanaCard {
  return {
    providerId: "1",
    printKey: "lorcana:1-1",
    setCode: "1",
    setName: null,
    number: 1,
    variant: null,
    promoGrouping: null,
    language: "fr",
    fullName: "Test Card",
    name: "Test",
    version: null,
    rarity: null,
    cardType: null,
    color: null,
    cost: null,
    artists: [],
    story: null,
    flavorText: null,
    foilTypes: ["None"],
    varnishType: null,
    imageUrl: "https://example.com/art.png",
    thumbnailUrl: null,
    foilMaskUrl: "https://example.com/foil.png",
    fullFoilUrl: null,
    varnishMaskUrl: null,
    cardmarketUrl: null,
    searchName: "test card",
    ...overrides,
  };
}

describe("cardHasFinish", () => {
  it("normalise VertWave / FreeForm aliases", () => {
    expect(
      cardHasFinish(card({ foilTypes: ["VerticalWave"] }), "VertWave"),
    ).toBe(true);
    expect(cardHasFinish(card({ foilTypes: ["FreeForm1"] }), "FreeForm")).toBe(
      true,
    );
    expect(cardHasFinish(card({ foilTypes: ["Silver"] }), "Magma")).toBe(false);
  });
});

describe("pickLorcanaPlayroomSamples", () => {
  const catalog = [
    card({
      printKey: "lorcana:satin-hg",
      fullName: "Satin HighGloss",
      foilTypes: ["Satin"],
      varnishType: "HighGloss",
      varnishMaskUrl: "https://example.com/v.png",
    }),
    card({
      printKey: "lorcana:satin-plain",
      fullName: "Satin plain",
      foilTypes: ["Satin"],
      varnishType: null,
    }),
    card({
      printKey: "lorcana:magma-metal",
      fullName: "Magma Metallic",
      foilTypes: ["Magma"],
      varnishType: "MetallicHotFoil",
      varnishMaskUrl: "https://example.com/v.png",
    }),
    card({
      printKey: "lorcana:magma-plain",
      fullName: "Magma plain",
      foilTypes: ["Magma"],
      varnishType: null,
    }),
    card({
      printKey: "lorcana:varnish-only",
      fullName: "Varnish host",
      foilTypes: ["None", "Silver"],
      varnishType: "HighGloss",
      varnishMaskUrl: "https://example.com/v.png",
    }),
    card({
      printKey: "lorcana:silver",
      fullName: "Silver only",
      foilTypes: ["None", "Silver"],
      varnishType: null,
      varnishMaskUrl: null,
    }),
  ];

  it("picks an exact finish+varnish print, never a wrong finish", () => {
    const samples = pickLorcanaPlayroomSamples(catalog, [
      { finish: "Satin", varnish: "HighGloss" },
      { finish: "Magma", varnish: "MetallicHotFoil" },
      { finish: "Tempest", varnish: null },
    ]);
    expect(samples.map((s) => s.printKey)).toEqual([
      "lorcana:satin-hg",
      "lorcana:magma-metal",
    ]);
    expect(samples.every((s) => s.shelfType === "tcg")).toBe(true);
  });

  it("prefers unvarnished when the material has no varnish", () => {
    const [sample] = pickLorcanaPlayroomSamples(catalog, [
      { finish: "Magma", varnish: null },
    ]);
    expect(sample?.printKey).toBe("lorcana:magma-plain");
  });

  it("fills varnish-only materials from any varnish-masked print", () => {
    const [sample] = pickLorcanaPlayroomSamples(catalog, [
      { finish: null, varnish: null },
    ]);
    expect(sample?.printKey).toMatch(/satin-hg|magma-metal|varnish-only/);
    expect(sample?.variant).toBeNull();
  });
});
