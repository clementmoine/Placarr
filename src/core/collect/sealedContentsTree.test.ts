import { describe, expect, it } from "vitest";

import { buyOptionsForMissing, expandBuyImpact } from "./buyAdvice";
import {
  buyProductToContentsSource,
  toContentsTree,
  type SealedContentsSource,
} from "./sealedContentsTree";

describe("toContentsTree", () => {
  it("maps a Lorcana booster to random ×1", () => {
    expect(
      toContentsTree({
        kind: "booster",
        behavior: "random_pack",
        cardsPerPack: 12,
        packsContained: 1,
        randomPoolScope: "set",
      }),
    ).toEqual([
      {
        kind: "random",
        packs: 1,
        cardsPerPack: 12,
        pool: "set",
      },
    ]);
  });

  it("maps blister pack_container ×1 like a unit pack", () => {
    expect(
      toContentsTree({
        kind: "blister",
        behavior: "pack_container",
        cardsPerPack: 12,
        packsContained: 1,
        randomPoolScope: "none",
        printsArePreview: true,
        printKeys: ["a", "b", "c"],
      }),
    ).toEqual([
      {
        kind: "random",
        packs: 1,
        cardsPerPack: 12,
        pool: "set",
      },
    ]);
  });

  it("maps a display to random ×24", () => {
    expect(
      toContentsTree({
        kind: "display",
        behavior: "pack_container",
        cardsPerPack: 12,
        packsContained: 24,
        randomPoolScope: "none",
      }),
    ).toEqual([
      {
        kind: "random",
        packs: 24,
        cardsPerPack: 12,
        pool: "set",
      },
    ]);
  });

  it("maps gift box to fixed promo + random packs", () => {
    expect(
      toContentsTree({
        kind: "collector_box",
        behavior: "mixed_bundle",
        guaranteedPrints: [{ printKey: "lorcana:5-6-p3", qty: 1 }],
        cardsPerPack: 12,
        packsContained: 5,
        randomPoolScope: "none",
      }),
    ).toEqual([
      { kind: "fixed", prints: [{ printKey: "lorcana:5-6-p3", qty: 1 }] },
      { kind: "random", packs: 5, cardsPerPack: 12, pool: "set" },
    ]);
  });

  it("maps Naruto duopack to random ×2", () => {
    expect(
      toContentsTree({
        kind: "multipack",
        behavior: "mixed_bundle",
        cardsPerPack: 8,
        packsContained: 2,
        randomPoolScope: "none",
      }),
    ).toEqual([
      { kind: "random", packs: 2, cardsPerPack: 8, pool: "set" },
    ]);
  });

  it("maps Naruto starter to fixed prints", () => {
    expect(
      toContentsTree({
        kind: "deck",
        behavior: "known_bundle",
        contentsKnown: true,
        printKeys: ["naruto:ni-1", "naruto:ni-2"],
        randomPoolScope: "none",
      }),
    ).toEqual([
      {
        kind: "fixed",
        prints: [{ printKey: "naruto:ni-1" }, { printKey: "naruto:ni-2" }],
      },
    ]);
  });

  it("maps tin packsBySet to one random node per set", () => {
    expect(
      toContentsTree({
        kind: "tin",
        behavior: "mixed_bundle",
        cardsPerPack: 8,
        packsBySet: { s1: 1, s2: 1 },
        randomPoolScope: "none",
        guaranteedPrints: [{ printKey: "naruto:ni-promo" }],
      }),
    ).toEqual([
      { kind: "fixed", prints: [{ printKey: "naruto:ni-promo" }] },
      {
        kind: "random",
        packs: 1,
        cardsPerPack: 8,
        pool: "set",
        setId: "s1",
      },
      {
        kind: "random",
        packs: 1,
        cardsPerPack: 8,
        pool: "set",
        setId: "s2",
      },
    ]);
  });

  it("maps pack-découverte to sku children", () => {
    expect(
      toContentsTree({
        kind: "deck_bundle",
        behavior: "mixed_bundle",
        guaranteedProducts: [
          { slug: "starter-a", qty: 1 },
          { slug: "starter-b", qty: 1 },
          { slug: "booster-s1", qty: 2 },
        ],
      }),
    ).toEqual([
      { kind: "sku", slug: "starter-a", qty: 1 },
      { kind: "sku", slug: "starter-b", qty: 1 },
      { kind: "sku", slug: "booster-s1", qty: 2 },
    ]);
  });

  it("maps Gateway / 2-player starter structureUnits without inventing lottery", () => {
    expect(
      toContentsTree({
        kind: "coffret",
        behavior: "mixed_bundle",
        randomPoolScope: "none",
        structureUnits: [
          { label: "Starting decks", count: 2, cardsEach: 30 },
          { label: "Reward packs", count: 4, cardsEach: 18 },
        ],
      }),
    ).toEqual([
      {
        kind: "units",
        label: "Starting decks",
        count: 2,
        cardsEach: 30,
      },
      {
        kind: "units",
        label: "Reward packs",
        count: 4,
        cardsEach: 18,
      },
    ]);
    expect(
      toContentsTree({
        structureUnits: [
          { label: "Ready-to-play decks", count: 2, cardsEach: 60 },
        ],
      }),
    ).toEqual([
      {
        kind: "units",
        label: "Ready-to-play decks",
        count: 2,
        cardsEach: 60,
      },
    ]);
  });

  it("ignores shop preview tiles on non-known_bundle", () => {
    expect(
      toContentsTree({
        kind: "trove",
        behavior: "mixed_bundle",
        printsArePreview: true,
        printKeys: Array.from({ length: 15 }, (_, i) => `p${i}`),
        cardsPerPack: 12,
        packsContained: 8,
        randomPoolScope: "none",
      }),
    ).toEqual([
      { kind: "random", packs: 8, cardsPerPack: 12, pool: "set" },
    ]);
  });
});

describe("expandBuyImpact", () => {
  it("expands pack-découverte through child SKUs", () => {
    const catalog: Record<string, SealedContentsSource> = {
      "starter-a": {
        kind: "deck",
        behavior: "known_bundle",
        contentsKnown: true,
        printKeys: ["a", "b", "c"],
      },
      "starter-b": {
        kind: "deck",
        behavior: "known_bundle",
        contentsKnown: true,
        printKeys: ["d", "e"],
      },
      "booster-s1": {
        kind: "booster",
        behavior: "random_pack",
        cardsPerPack: 8,
        packsContained: 1,
        randomPoolScope: "set",
      },
    };
    const missing = new Set(["a", "d", "x1", "x2", "x3", "x4"]);
    const impact = expandBuyImpact({
      tree: toContentsTree({
        guaranteedProducts: [
          { slug: "starter-a", qty: 1 },
          { slug: "starter-b", qty: 1 },
          { slug: "booster-s1", qty: 2 },
        ],
      }),
      missing,
      poolSize: 100,
      resolveSku: (slug) => catalog[slug] ?? null,
    });
    // fixed hits: a + d = 2 ; plus expected from 2×8 random
    expect(impact.newCards).toBeGreaterThan(2);
    expect(impact.certainty).toBe("expected");
    expect(impact.basis).toContain("starter-a");
  });

  it("blister ×1 matches booster EV", () => {
    const missing = new Set(
      Array.from({ length: 40 }, (_, i) => `c${i}`),
    );
    const booster = expandBuyImpact({
      tree: toContentsTree({
        kind: "booster",
        behavior: "random_pack",
        cardsPerPack: 12,
        packsContained: 1,
        randomPoolScope: "set",
      }),
      missing,
      poolSize: 216,
    });
    const blister = expandBuyImpact({
      tree: toContentsTree({
        kind: "blister",
        behavior: "pack_container",
        cardsPerPack: 12,
        packsContained: 1,
        randomPoolScope: "none",
      }),
      missing,
      poolSize: 216,
    });
    expect(blister.newCards).toBe(booster.newCards);
    expect(blister.certainty).toBe("expected");
  });
});

describe("buyOptionsForMissing via guaranteedProducts tree", () => {
  it("scores pack-découverte by expanding children", () => {
    const missing = new Set(["a", "b", "z"]);
    const options = buyOptionsForMissing({
      missing,
      poolSize: 40,
      products: [
        {
          slug: "pack-decouverte",
          name: "Pack Découverte",
          kind: "deck_bundle",
          behavior: "mixed_bundle",
          guaranteedProducts: [
            { slug: "starter-a", qty: 1 },
            { slug: "booster-s1", qty: 1 },
          ],
          priceCents: 2000,
        },
        {
          slug: "starter-a",
          name: "Starter A",
          kind: "deck",
          behavior: "known_bundle",
          contentsKnown: true,
          prints: ["a", "b", "c"],
        },
        {
          slug: "booster-s1",
          name: "Booster",
          kind: "booster",
          behavior: "random_pack",
          packSize: 8,
          packsInContainer: 1,
          randomPoolScope: "set",
        },
      ],
    });
    const pack = options.find((o) => o.slug === "pack-decouverte");
    expect(pack).toBeDefined();
    expect(pack!.newCards).toBeGreaterThanOrEqual(2);
    expect(pack!.basis).toMatch(/Arbre|starter-a/i);
  });
});

describe("buyProductToContentsSource", () => {
  it("round-trips packSize / packsInContainer", () => {
    expect(
      buyProductToContentsSource({
        kind: "display",
        behavior: "pack_container",
        packSize: 12,
        packsInContainer: 24,
        randomPoolScope: "none",
      }),
    ).toMatchObject({
      cardsPerPack: 12,
      packsContained: 24,
    });
  });
});
