import { describe, expect, it } from "vitest";

import { variantRendering } from "./usePrintVariant";

const info = {
  finishes: ["None", "Silver"],
  plainFinishes: ["None"],
  foilMaskUrl: "/uploads/mask.jpg",
  varnishMaskUrl: null,
};

const BASE = "/uploads/card.jpg";

const plainFields = {
  effectPackId: null,
  finish: null,
  varnishType: null,
};

describe("variantRendering", () => {
  it("renders a foil copy with its masks", () => {
    expect(variantRendering("Silver", info, BASE)).toMatchObject({
      imageUrl: BASE,
      foilMaskUrl: "/uploads/mask.jpg",
      varnishMaskUrl: null,
      effectPackId: null,
      finish: "Silver",
      varnishType: null,
    });
  });

  it("gives a plain finish no effect at all", () => {
    // Shimmering on both a normal and a foil copy would distinguish nothing.
    expect(variantRendering("None", info, BASE)).toMatchObject({
      imageUrl: BASE,
      foilMaskUrl: null,
      varnishMaskUrl: null,
      ...plainFields,
    });
  });

  it("prefers the provider's own artwork for the variant when it exists", () => {
    expect(
      variantRendering(
        "Silver",
        { ...info, variantImageUrls: { Silver: "/uploads/foil.jpg" } },
        BASE,
      ),
    ).toMatchObject({ imageUrl: "/uploads/foil.jpg" });
  });

  it("treats an unrecognized variant as plain rather than guessing", () => {
    expect(variantRendering("Rainbow", info, BASE)).toMatchObject({
      imageUrl: BASE,
      foilMaskUrl: null,
      varnishMaskUrl: null,
      ...plainFields,
    });
  });

  it("gives no effect when the copy has no variant", () => {
    expect(variantRendering(null, info, BASE)).toMatchObject(plainFields);
    expect(variantRendering("  ", info, BASE)).toMatchObject(plainFields);
  });

  it("gives no effect before the provider has answered", () => {
    expect(variantRendering("Silver", null, BASE)).toMatchObject({
      imageUrl: BASE,
      foilMaskUrl: null,
      varnishMaskUrl: null,
      ...plainFields,
    });
  });

  it("matches the finish case-insensitively", () => {
    expect(variantRendering("silver", info, BASE).foilMaskUrl).toBe(
      "/uploads/mask.jpg",
    );
  });

  it("draws each finish with the look its provider gives it", () => {
    // Every non-plain finish used to render identically, so an Enchanted print
    // and a common silver one were indistinguishable on screen.
    const enchanted = {
      finishes: ["Lava"],
      plainFinishes: [],
      finishShaders: { Lava: "lava" },
      foilMaskUrl: "/uploads/mask.jpg",
      varnishMaskUrl: null,
    };

    expect(variantRendering("Lava", enchanted, BASE).shader.id).toBe("lava");
    expect(variantRendering("Silver", info, BASE).shader.id).toBe("silver");
  });

  it("still draws a foil this build has no look for", () => {
    // The copy really is foil; rendering it plain would state the opposite.
    const unknown = { ...info, finishShaders: { Silver: "iridescent-v2" } };
    expect(variantRendering("Silver", unknown, BASE).shader.id).toBe("silver");
    expect(variantRendering("Silver", unknown, BASE).foilMaskUrl).toBe(
      "/uploads/mask.jpg",
    );
  });

  it("carries the varnish layer when the print has one", () => {
    expect(
      variantRendering(
        "Silver",
        { ...info, varnishMaskUrl: "/uploads/v.jpg" },
        BASE,
      ),
    ).toMatchObject({ varnishMaskUrl: "/uploads/v.jpg" });
  });

  it("carries effect pack metadata for foil copies", () => {
    expect(
      variantRendering(
        "Silver",
        { ...info, effectPack: "lorcana", varnishType: "HotFoil" },
        BASE,
      ),
    ).toMatchObject({
      effectPackId: "lorcana",
      finish: "Silver",
      varnishType: "HotFoil",
    });
  });
});
