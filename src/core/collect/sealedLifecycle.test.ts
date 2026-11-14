import { describe, expect, it } from "vitest";

import {
  canDeriveVirtualContents,
  containmentState,
  countsAsInHand,
  countsTowardPossession,
  resolveCollectionDisplayStatus,
  virtualContents,
  virtualPrintKeySet,
  type VirtualProductView,
} from "./sealedLifecycle";

function product(
  over: Partial<VirtualProductView> & Pick<VirtualProductView, "skuKey">,
): VirtualProductView {
  return {
    contentsKnown: true,
    printsArePreview: false,
    ...over,
  };
}

describe("containmentState", () => {
  it("is sealed until opened", () => {
    expect(containmentState({})).toBe("sealed");
    expect(containmentState({ openedAt: null })).toBe("sealed");
    expect(
      containmentState({
        links: [{ role: "content", attached: true }],
      }),
    ).toBe("sealed");
  });

  it("is partial when opened with sealed children still attached (display pile)", () => {
    expect(
      containmentState({
        openedAt: "2026-11-07T12:00:00.000Z",
        links: [
          { role: "content", attached: true, childSealed: true },
          { role: "content", attached: true, childSealed: true },
          { role: "shell", attached: true },
        ],
      }),
    ).toBe("partial");
  });

  it("is emptied when opened and only cards/shell remain linked (known open)", () => {
    expect(
      containmentState({
        openedAt: "2026-11-07T12:00:00.000Z",
        links: [
          { role: "content", attached: true, childSealed: false },
          { role: "shell", attached: true },
        ],
      }),
    ).toBe("emptied");
    expect(
      containmentState({
        openedAt: "2026-11-07T12:00:00.000Z",
        links: [],
      }),
    ).toBe("emptied");
  });
});

describe("virtualContents", () => {
  it("lists guaranteed prints for a sealed known deck", () => {
    const contents = virtualContents({
      presence: "owned",
      product: product({
        skuKey: "naruto::starter-a",
        behavior: "known_bundle",
        contentsKnown: true,
        guaranteedPrints: [
          { printKey: "naruto:ni-0001", qty: 1 },
          { printKey: "naruto:ni-0002", qty: 2 },
        ],
      }),
    });
    expect(contents).toEqual([
      { kind: "print", printKey: "naruto:ni-0001", qty: 1 },
      { kind: "print", printKey: "naruto:ni-0002", qty: 2 },
    ]);
    expect(virtualPrintKeySet(contents).has("naruto:ni-0001")).toBe(true);
  });

  it("keeps virtuals when the sealed deck is away", () => {
    const contents = virtualContents({
      presence: "away",
      product: product({
        skuKey: "lorcana::starter",
        behavior: "known_bundle",
        contentsKnown: true,
        guaranteedPrints: [{ printKey: "lorcana:1-1" }],
      }),
    });
    expect(contents).toHaveLength(1);
  });

  it("returns nothing when contentsKnown is false", () => {
    expect(
      virtualContents({
        presence: "owned",
        product: product({
          skuKey: "x::quest",
          behavior: "mixed_bundle",
          contentsKnown: false,
          guaranteedPrints: [{ printKey: "game:1" }],
        }),
      }),
    ).toEqual([]);
  });

  it("returns nothing for boutique preview prints", () => {
    expect(
      canDeriveVirtualContents({
        presence: "owned",
        contentsKnown: true,
        printsArePreview: true,
      }),
    ).toBe(false);
    expect(
      virtualContents({
        presence: "owned",
        product: product({
          skuKey: "x::tin",
          behavior: "known_bundle",
          contentsKnown: true,
          printsArePreview: true,
          printKeys: ["game:1", "game:2"],
        }),
      }),
    ).toEqual([]);
  });

  it("returns nothing after the product is opened", () => {
    expect(
      virtualContents({
        presence: "owned",
        openedAt: "2026-11-07T12:00:00.000Z",
        product: product({
          skuKey: "x::deck",
          behavior: "known_bundle",
          contentsKnown: true,
          guaranteedPrints: [{ printKey: "game:1" }],
        }),
      }),
    ).toEqual([]);
  });

  it("returns nothing for a past parent and reads a legacy wanted parent as away", () => {
    expect(
      virtualContents({
        presence: "past",
        product: product({
          skuKey: "x::deck",
          behavior: "known_bundle",
          contentsKnown: true,
          guaranteedPrints: [{ printKey: "game:1" }],
        }),
      }),
    ).toEqual([]);
    expect(
      virtualContents({
        presence: "wanted",
        product: product({
          skuKey: "x::deck",
          behavior: "known_bundle",
          contentsKnown: true,
          guaranteedPrints: [{ printKey: "game:1" }],
        }),
      }),
    ).toEqual([{ kind: "print", printKey: "game:1", qty: 1 }]);
  });

  it("exposes child SKUs for a mixed bundle, not lottery prints", () => {
    const contents = virtualContents({
      presence: "owned",
      product: product({
        skuKey: "lorcana::etb-1",
        behavior: "mixed_bundle",
        contentsKnown: true,
        guaranteedPrints: [{ printKey: "lorcana:1-promo" }],
        guaranteedProducts: [{ slug: "booster-chapter-1", qty: 8 }],
        packsContained: 8,
        cardsPerPack: 12,
        randomPoolScope: "set",
      }),
    });
    expect(contents).toEqual([
      { kind: "print", printKey: "lorcana:1-promo", qty: 1 },
      { kind: "sku", slug: "booster-chapter-1", qty: 8 },
    ]);
  });

  it("does not invent booster virtuels from packsContained alone (display)", () => {
    expect(
      virtualContents({
        presence: "owned",
        product: product({
          skuKey: "lorcana::display-1",
          behavior: "pack_container",
          contentsKnown: true,
          packsContained: 24,
          cardsPerPack: 12,
          randomPoolScope: "set",
        }),
      }),
    ).toEqual([]);
  });

  it("lists N child boosters when the display names them", () => {
    expect(
      virtualContents({
        presence: "owned",
        product: product({
          skuKey: "lorcana::display-1",
          behavior: "pack_container",
          contentsKnown: true,
          packsContained: 24,
          guaranteedProducts: [{ slug: "booster-chapter-1", qty: 24 }],
        }),
      }),
    ).toEqual([{ kind: "sku", slug: "booster-chapter-1", qty: 24 }]);
  });
});

describe("resolveCollectionDisplayStatus", () => {
  it("prefers physical presence over virtual coverage", () => {
    expect(
      resolveCollectionDisplayStatus({
        presence: "owned",
        virtual: true,
      }),
    ).toBe("owned");
    expect(
      resolveCollectionDisplayStatus({
        presence: "away",
        virtual: true,
      }),
    ).toBe("away");
    expect(
      resolveCollectionDisplayStatus({
        presence: "past",
        virtual: true,
      }),
    ).toBe("past");
    expect(
      resolveCollectionDisplayStatus({
        presence: "wanted",
        virtual: true,
      }),
    ).toBe("away");
  });

  it("marks virtual when only covered by a sealed parent", () => {
    expect(
      resolveCollectionDisplayStatus({
        virtual: true,
        hasPhysical: false,
      }),
    ).toBe("virtual");
  });

  it("is missing when neither physical nor virtual", () => {
    expect(resolveCollectionDisplayStatus({})).toBe("missing");
  });

  it("possession counters: virtual counts, past does not", () => {
    expect(countsTowardPossession("owned")).toBe(true);
    expect(countsTowardPossession("away")).toBe(true);
    expect(countsTowardPossession("virtual")).toBe(true);
    expect(countsTowardPossession("past")).toBe(false);
    expect(countsTowardPossession("missing")).toBe(false);
    expect(countsAsInHand("owned")).toBe(true);
    expect(countsAsInHand("virtual")).toBe(false);
    expect(countsAsInHand("away")).toBe(false);
  });
});
