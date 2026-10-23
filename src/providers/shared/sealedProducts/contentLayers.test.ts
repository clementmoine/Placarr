import { describe, expect, it } from "vitest";

import {
  resolveContentLayers,
  sealedStructureAttested,
} from "./contentLayers";

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

  it("treats opaque ETB/tin/multipack as child-pack lottery (scope none)", () => {
    for (const kind of ["etb", "tin", "multipack", "collector_box"] as const) {
      const layers = resolveContentLayers({
        kind,
        behavior: "mixed_bundle",
        prints: [],
        contentsKnown: false,
        containsPrintsIsPreview: false,
      });
      expect(layers.randomPoolScope).toBe("none");
      expect(layers.guaranteedPrints).toEqual([]);
    }
  });
});

describe("sealedStructureAttested", () => {
  it("accepts Lorcana-style boosters (cardsPerPack + set pool)", () => {
    expect(
      sealedStructureAttested({
        kind: "booster",
        behavior: "random_pack",
        contentsKnown: false,
        cardsPerPack: 12,
        packsContained: 1,
        randomPoolScope: "set",
      }),
    ).toBe(true);
  });

  it("accepts Pokémon-style boosters (set pool without cardsPerPack)", () => {
    expect(
      sealedStructureAttested({
        kind: "booster",
        behavior: "random_pack",
        contentsKnown: false,
        cardsPerPack: null,
        packsContained: 1,
        randomPoolScope: "set",
      }),
    ).toBe(true);
  });

  it("rejects boosters without a pack size", () => {
    expect(
      sealedStructureAttested({
        kind: "booster",
        behavior: "random_pack",
        contentsKnown: false,
        cardsPerPack: null,
        packsContained: 1,
        randomPoolScope: "unknown",
      }),
    ).toBe(false);
  });

  it("accepts displays with packsContained", () => {
    expect(
      sealedStructureAttested({
        kind: "display",
        behavior: "pack_container",
        contentsKnown: false,
        cardsPerPack: null,
        packsContained: 24,
        randomPoolScope: "none",
      }),
    ).toBe(true);
  });

  it("accepts troves with packsContained", () => {
    expect(
      sealedStructureAttested({
        kind: "trove",
        behavior: "mixed_bundle",
        contentsKnown: false,
        cardsPerPack: 12,
        packsContained: 8,
        randomPoolScope: "none",
      }),
    ).toBe(true);
  });

  it("accepts constructed decks by declared size without inventory", () => {
    expect(
      sealedStructureAttested({
        kind: "deck",
        behavior: "known_bundle",
        contentsKnown: false,
        cardsPerPack: null,
        packsContained: null,
        randomPoolScope: "none",
        declaredCardCount: 40,
      }),
    ).toBe(true);
  });

  it("accepts constructed decks by kind even without declared size", () => {
    expect(
      sealedStructureAttested({
        kind: "deck",
        behavior: "known_bundle",
        contentsKnown: false,
        cardsPerPack: null,
        packsContained: null,
        randomPoolScope: "unknown",
        declaredCardCount: null,
      }),
    ).toBe(true);
  });

  it("rejects opaque known_bundle non-decks without size", () => {
    expect(
      sealedStructureAttested({
        kind: "special",
        behavior: "known_bundle",
        contentsKnown: false,
        cardsPerPack: null,
        packsContained: null,
        randomPoolScope: "unknown",
        declaredCardCount: null,
      }),
    ).toBe(false);
  });

  it("accepts fixed promo sets (cards + declared, no packs)", () => {
    expect(
      sealedStructureAttested({
        kind: "collector_box",
        behavior: "mixed_bundle",
        contentsKnown: false,
        cardsPerPack: 4,
        packsContained: null,
        randomPoolScope: "unknown",
        declaredCardCount: 4,
      }),
    ).toBe(true);
  });

  it("accepts quests / mixed bundles by declared size alone", () => {
    expect(
      sealedStructureAttested({
        kind: "quest",
        behavior: "mixed_bundle",
        contentsKnown: false,
        cardsPerPack: null,
        packsContained: null,
        randomPoolScope: "none",
        declaredCardCount: 170,
      }),
    ).toBe(true);
  });

  it("rejects opaque collector boxes with no size or packs", () => {
    expect(
      sealedStructureAttested({
        kind: "collector_box",
        behavior: "mixed_bundle",
        contentsKnown: false,
        cardsPerPack: null,
        packsContained: null,
        randomPoolScope: "unknown",
      }),
    ).toBe(false);
  });

  it("attests ephemera / no_cards as structure without inventing cards", () => {
    expect(
      sealedStructureAttested({
        kind: "ephemera",
        behavior: "no_cards",
        contentsKnown: false,
        cardsPerPack: null,
        packsContained: null,
        randomPoolScope: "none",
      }),
    ).toBe(true);
  });
});
