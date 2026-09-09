import { describe, expect, it } from "vitest";

import { resolveContentLayers } from "./contentLayers";

const link = (printKey: string) => ({
  name: printKey,
  slug: printKey,
  ref: printKey,
  printKey,
});

describe("resolveContentLayers", () => {
  it("puts an exact starter list into guaranteedPrints", () => {
    const layers = resolveContentLayers({
      kind: "deck",
      behavior: "known_bundle",
      prints: [link("a"), link("b")],
      contentsKnown: true,
      containsPrintsIsPreview: false,
    });
    expect(layers).toEqual({
      guaranteedPrints: [link("a"), link("b")],
      randomPoolScope: "none",
      randomPoolPrints: [],
    });
  });

  it("does not treat a shop preview as guaranteed or as a pool", () => {
    const layers = resolveContentLayers({
      kind: "deck",
      behavior: "known_bundle",
      prints: [link("tile")],
      contentsKnown: false,
      containsPrintsIsPreview: true,
    });
    expect(layers.guaranteedPrints).toEqual([]);
    expect(layers.randomPoolScope).toBe("unknown");
  });

  it("defaults a classic booster lottery to the catalogue set (unverified)", () => {
    const layers = resolveContentLayers({
      kind: "booster",
      behavior: "random_pack",
      prints: [link("preview")],
      contentsKnown: false,
      containsPrintsIsPreview: true,
    });
    expect(layers.guaranteedPrints).toEqual([]);
    expect(layers.randomPoolScope).toBe("set");
    expect(layers.randomPoolPrints).toEqual([]);
  });

  it("keeps a display's lottery on its child packs", () => {
    const layers = resolveContentLayers({
      kind: "display",
      behavior: "pack_container",
      prints: [],
      contentsKnown: false,
      containsPrintsIsPreview: true,
    });
    expect(layers.randomPoolScope).toBe("none");
  });
});
