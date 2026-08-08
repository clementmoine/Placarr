import { describe, expect, it } from "vitest";

import "@/effects";
import { variantRendering } from "./usePrintVariant";

const lorcana = {
  finishes: ["None", "Silver"],
  plainFinishes: ["None"],
  foilMaskUrl: "/uploads/mask.jpg",
  varnishMaskUrl: null,
  effectPack: "lorcana",
};

const BASE = "/uploads/card.jpg";

const plainFields = {
  effectPackId: null,
  finish: null,
  varnishType: null,
  shader: null,
  varnish: null,
};

describe("variantRendering", () => {
  it("renders a foil copy with its masks", () => {
    expect(variantRendering("Silver", lorcana, BASE)).toMatchObject({
      imageUrl: BASE,
      foilMaskUrl: "/uploads/mask.jpg",
      varnishMaskUrl: null,
      effectPackId: "lorcana",
      finish: "Silver",
      varnishType: null,
    });
  });

  it("gives a plain finish no foil layers but keeps the effect pack for card backs", () => {
    expect(variantRendering("None", lorcana, BASE)).toMatchObject({
      imageUrl: BASE,
      foilMaskUrl: null,
      varnishMaskUrl: null,
      shader: null,
      varnish: null,
      effectPackId: "lorcana",
      finish: "None",
    });
  });

  it("prefers the provider's own artwork for the variant when it exists", () => {
    expect(
      variantRendering(
        "Silver",
        { ...lorcana, variantImageUrls: { Silver: "/uploads/foil.jpg" } },
        BASE,
      ),
    ).toMatchObject({ imageUrl: "/uploads/foil.jpg" });
  });

  it("treats an unrecognized variant as plain rather than guessing", () => {
    expect(variantRendering("Rainbow", lorcana, BASE)).toMatchObject({
      imageUrl: BASE,
      foilMaskUrl: null,
      varnishMaskUrl: null,
      effectPackId: "lorcana",
      finish: null,
      varnishType: null,
      shader: null,
      varnish: null,
    });
  });

  it("keeps the effect pack for backs when the copy has no variant", () => {
    expect(variantRendering(null, lorcana, BASE)).toMatchObject({
      imageUrl: BASE,
      foilMaskUrl: null,
      effectPackId: "lorcana",
      finish: null,
      shader: null,
    });
    expect(variantRendering("  ", lorcana, BASE)).toMatchObject({
      effectPackId: "lorcana",
      finish: null,
    });
  });

  it("gives no effect before the provider has answered", () => {
    expect(variantRendering("Silver", null, BASE)).toMatchObject({
      imageUrl: BASE,
      foilMaskUrl: null,
      varnishMaskUrl: null,
      ...plainFields,
    });
  });

  it("prefers a per-finish foil mask when the provider supplies one", () => {
    expect(
      variantRendering(
        "Silver",
        {
          ...lorcana,
          foilMaskUrl: "/uploads/mask.jpg",
          finishFoilMaskUrls: { Silver: "/foil/live/mask.png" },
        },
        BASE,
      ).foilMaskUrl,
    ).toBe("/foil/live/mask.png");
  });

  it("matches the finish case-insensitively", () => {
    expect(variantRendering("silver", lorcana, BASE).foilMaskUrl).toBe(
      "/uploads/mask.jpg",
    );
  });

  it("draws each finish from pack.resolveCss, not Unity finishShaders", () => {
    const enchanted = {
      finishes: ["Lava"],
      plainFinishes: [],
      effectPack: "lorcana",
      foilMaskUrl: "/uploads/mask.jpg",
      varnishMaskUrl: null,
    };

    expect(variantRendering("Lava", enchanted, BASE).shader?.id).toBe("lava");
    expect(variantRendering("Silver", lorcana, BASE).shader?.id).toBe("silver");
  });

  it("accepts provider finishShaders only when they are CSS look ids", () => {
    // Stale / partial candidates without effectPack still got CSS via this table.
    const legacy = {
      finishes: ["Lava"],
      plainFinishes: [],
      finishShaders: { Lava: "lava" },
      foilMaskUrl: "/uploads/mask.jpg",
    };
    expect(variantRendering("Lava", legacy, BASE).shader?.id).toBe("lava");
  });

  it("uses the Lorcana pack silver default for an unknown foil finish", () => {
    const unknown = {
      finishes: ["Kaleidoscope"],
      plainFinishes: [],
      effectPack: "lorcana",
      foilMaskUrl: "/uploads/mask.jpg",
      varnishMaskUrl: null,
    };
    expect(variantRendering("Kaleidoscope", unknown, BASE).shader?.id).toBe(
      "silver",
    );
    expect(variantRendering("Kaleidoscope", unknown, BASE).foilMaskUrl).toBe(
      "/uploads/mask.jpg",
    );
  });

  it("gives Pokémon a simey catalogue look through its own mask, never a Lorcana one", () => {
    const pokemon = {
      finishes: ["holo"],
      plainFinishes: [],
      effectPack: "pokemon",
      finishShaders: { holo: "SunPillar" },
      foilMaskUrl: "/uploads/mask.jpg",
      varnishMaskUrl: null,
    };
    const rendering = variantRendering("holo", pokemon, BASE);
    /*
      Catalogue `holo` resolves to simey regularHolo; the mask is the print's
      own. Unity material names in finishShaders are not CSS look ids.
    */
    expect(rendering.shader?.id).toBe("regularHolo");
    expect(JSON.stringify(rendering.shader)).not.toContain("/foil/lorcana/");
    expect(rendering.foilMaskUrl).toBe("/uploads/mask.jpg");
    expect(rendering.effectPackId).toBe("pokemon");

    // A stale candidate without its pack id must stay plain: Unity material
    // names in finishShaders are not CSS look ids.
    const stale = { ...pokemon, effectPack: undefined };
    expect(variantRendering("holo", stale, BASE).shader).toBeNull();
  });

  it("stays plain when there is a mask but no pack and no CSS finishShaders", () => {
    expect(
      variantRendering(
        "Silver",
        {
          finishes: ["Silver"],
          plainFinishes: [],
          foilMaskUrl: "/uploads/mask.jpg",
        },
        BASE,
      ).shader,
    ).toBeNull();
  });

  it("carries the varnish layer when the print has one", () => {
    expect(
      variantRendering(
        "Silver",
        { ...lorcana, varnishMaskUrl: "/uploads/v.jpg" },
        BASE,
      ),
    ).toMatchObject({ varnishMaskUrl: "/uploads/v.jpg" });
  });

  it("carries effect pack metadata for foil copies", () => {
    expect(
      variantRendering(
        "Silver",
        { ...lorcana, varnishType: "HighGloss" },
        BASE,
      ),
    ).toMatchObject({
      effectPackId: "lorcana",
      finish: "Silver",
      varnishType: "HighGloss",
      varnish: expect.objectContaining({ id: "hotFoil" }),
    });
  });
});
