import { describe, expect, it } from "vitest";

import {
  compositionSlotsForChild,
  countMatchingAttachedChildren,
  listCompatibleContainmentParents,
  planContainmentAttach,
  reattachChildRef,
} from "./sealedReattach";

const display = {
  contentsKnown: true,
  behavior: "pack_container",
  packsContained: 24,
  guaranteedProducts: [{ slug: "booster-s1", qty: 24 }],
};

const starter = {
  contentsKnown: true,
  behavior: "known_bundle",
  guaranteedPrints: [
    { printKey: "lorcana:1-1", qty: 1 },
    { printKey: "lorcana:1-2", qty: 1 },
  ],
};

describe("reattachChildRef", () => {
  it("reads sealed slug and card printKey", () => {
    expect(
      reattachChildRef({ kind: "sealed", skuKey: "lorcana::booster-s1" }),
    ).toEqual({
      kind: "sealed",
      slug: "booster-s1",
      skuKey: "lorcana::booster-s1",
    });
    expect(
      reattachChildRef({ kind: "card", printKey: "lorcana:1-1" }),
    ).toEqual({ kind: "card", printKey: "lorcana:1-1" });
    expect(reattachChildRef({ kind: "shell", skuKey: "lorcana::x" })).toBeNull();
  });
});

describe("compositionSlotsForChild", () => {
  it("counts guaranteed SKU and fixed print slots", () => {
    expect(
      compositionSlotsForChild(display, {
        kind: "sealed",
        slug: "booster-s1",
        skuKey: "lorcana::booster-s1",
      }),
    ).toBe(24);
    expect(
      compositionSlotsForChild(display, {
        kind: "sealed",
        slug: "other",
        skuKey: "lorcana::other",
      }),
    ).toBe(0);
    expect(
      compositionSlotsForChild(starter, {
        kind: "card",
        printKey: "lorcana:1-1",
      }),
    ).toBe(1);
  });

  it("refuses preview / unknown contents", () => {
    expect(
      compositionSlotsForChild(
        { ...display, printsArePreview: true },
        {
          kind: "sealed",
          slug: "booster-s1",
          skuKey: "lorcana::booster-s1",
        },
      ),
    ).toBe(0);
  });
});

describe("planContainmentAttach", () => {
  const parent = {
    id: "display-1",
    name: "Display S1",
    kind: "sealed",
    skuKey: "lorcana::display-s1",
    openedAt: new Date(),
    countsAsOwned: true,
  };
  const child = {
    kind: "sealed" as const,
    slug: "booster-s1",
    skuKey: "lorcana::booster-s1",
  };

  it("accepts an opened display with remaining slots", () => {
    const plan = planContainmentAttach({
      child,
      parent,
      product: display,
      attachedMatching: 3,
    });
    expect(plan).toMatchObject({ ok: true, remaining: 21, slots: 24 });
  });

  it("rejects still-sealed / full / mismatch", () => {
    expect(
      planContainmentAttach({
        child,
        parent: { ...parent, openedAt: null },
        product: display,
        attachedMatching: 0,
      }).ok,
    ).toBe(false);
    expect(
      planContainmentAttach({
        child,
        parent,
        product: display,
        attachedMatching: 24,
      }),
    ).toMatchObject({ ok: false, reason: "capacity_full" });
    expect(
      planContainmentAttach({
        child: { ...child, slug: "nope" },
        parent,
        product: display,
        attachedMatching: 0,
      }),
    ).toMatchObject({ ok: false, reason: "composition_mismatch" });
  });
});

describe("listCompatibleContainmentParents", () => {
  it("filters and sorts parents with remaining capacity", () => {
    const child = reattachChildRef({
      kind: "sealed",
      skuKey: "lorcana::booster-s1",
    })!;
    const list = listCompatibleContainmentParents({
      child,
      parents: [
        {
          parent: {
            id: "b",
            name: "Display B",
            kind: "sealed",
            skuKey: "lorcana::display-b",
            openedAt: new Date(),
            countsAsOwned: true,
          },
          product: display,
          attachedMatching: 0,
        },
        {
          parent: {
            id: "a",
            name: "Display A",
            kind: "sealed",
            skuKey: "lorcana::display-a",
            openedAt: new Date(),
            countsAsOwned: true,
          },
          product: display,
          attachedMatching: 23,
        },
        {
          parent: {
            id: "full",
            name: "Full",
            kind: "sealed",
            skuKey: "lorcana::display-full",
            openedAt: new Date(),
            countsAsOwned: true,
          },
          product: display,
          attachedMatching: 24,
        },
      ],
    });
    expect(list.map((row) => row.id)).toEqual(["a", "b"]);
    expect(list[0]!.remaining).toBe(1);
  });
});

describe("countMatchingAttachedChildren", () => {
  it("counts same slug / printKey among attached children", () => {
    expect(
      countMatchingAttachedChildren({
        child: {
          kind: "sealed",
          slug: "booster-s1",
          skuKey: "lorcana::booster-s1",
        },
        attachedChildren: [
          { kind: "sealed", skuKey: "lorcana::booster-s1" },
          { kind: "sealed", skuKey: "lorcana::booster-s1" },
          { kind: "sealed", skuKey: "lorcana::booster-s2" },
        ],
      }),
    ).toBe(2);
  });
});
