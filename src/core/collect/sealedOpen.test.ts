import { describe, expect, it } from "vitest";

import {
  parseSealedSkuKey,
  planSealedDeclare,
  planSealedOpen,
} from "./sealedOpen";

describe("parseSealedSkuKey", () => {
  it("splits packId::slug when packId contains slashes", () => {
    expect(parseSealedSkuKey("naruto/carddass::starter-a")).toEqual({
      packId: "naruto/carddass",
      slug: "starter-a",
    });
  });

  it("rejects malformed keys", () => {
    expect(parseSealedSkuKey("")).toBeNull();
    expect(parseSealedSkuKey("nosep")).toBeNull();
    expect(parseSealedSkuKey("::slug")).toBeNull();
  });
});

describe("planSealedOpen", () => {
  const baseProduct = {
    behavior: "known_bundle",
    contentsKnown: true,
    printsArePreview: false,
    lang: "fr",
    guaranteedPrints: [
      { printKey: "naruto:ni-0001", qty: 1 },
      { printKey: "naruto:ni-0002", qty: 2 },
    ],
  };

  it("plans one card item per guaranteed print qty", () => {
    const plan = planSealedOpen({
      skuKey: "naruto/carddass::starter-a",
      countsAsOwned: true,
      product: baseProduct,
      titleForPrint: (key) => (key.endsWith("0001") ? "Naruto" : "Sasuke"),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.remainingSealed).toBe(0);
    expect(plan.children).toEqual([
      {
        kind: "card",
        printKey: "naruto:ni-0001",
        name: "Naruto",
        language: "fr",
      },
      {
        kind: "card",
        printKey: "naruto:ni-0002",
        name: "Sasuke",
        language: "fr",
      },
      {
        kind: "card",
        printKey: "naruto:ni-0002",
        name: "Sasuke",
        language: "fr",
      },
    ]);
  });

  it("builds a display pile from guaranteedProducts", () => {
    const plan = planSealedOpen({
      skuKey: "lorcana::display-s1",
      countsAsOwned: true,
      product: {
        behavior: "pack_container",
        contentsKnown: true,
        packsContained: 24,
        guaranteedProducts: [{ slug: "booster-s1", qty: 24 }],
        lang: "fr",
      },
      titleForSku: () => "Booster S1",
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.children).toHaveLength(24);
    expect(plan.children.every((c) => c.kind === "sealed")).toBe(true);
    expect(plan.children[0]).toMatchObject({
      kind: "sealed",
      skuKey: "lorcana::booster-s1",
      name: "Booster S1",
    });
  });

  it("accepts childBoosterSlug × packCount when catalogue has no product links", () => {
    const plan = planSealedOpen({
      skuKey: "lorcana::display-s1",
      countsAsOwned: true,
      product: {
        behavior: "pack_container",
        contentsKnown: true,
        packsContained: null,
      },
      childBoosterSlug: "booster-s1",
      packCount: 3,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.children).toHaveLength(3);
  });

  it("opens blister ×1 in one step without phantom booster", () => {
    const plan = planSealedOpen({
      skuKey: "dbs::blister-bt24",
      countsAsOwned: true,
      product: {
        kind: "blister",
        behavior: "pack_container",
        contentsKnown: true,
        packsContained: 1,
      },
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.children).toEqual([]);
    expect(plan.remainingSealed).toBe(0);
  });

  it("opens packsContained=1 without named child as a unit pack", () => {
    const plan = planSealedOpen({
      skuKey: "op::multipack-1",
      countsAsOwned: true,
      product: {
        kind: "multipack",
        behavior: "pack_container",
        contentsKnown: true,
        packsContained: 1,
      },
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.children).toEqual([]);
  });

  it("still materializes named child SKU on blister when composition is known", () => {
    const plan = planSealedOpen({
      skuKey: "dbs::blister-named",
      countsAsOwned: true,
      product: {
        kind: "blister",
        behavior: "pack_container",
        contentsKnown: true,
        packsContained: 1,
        guaranteedProducts: [{ slug: "booster-bt24", qty: 1 }],
      },
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.children).toHaveLength(1);
    expect(plan.children[0]).toMatchObject({
      kind: "sealed",
      skuKey: "dbs::booster-bt24",
    });
  });

  it("partial take keeps remainingSealed", () => {
    const plan = planSealedOpen({
      skuKey: "lorcana::display-s1",
      countsAsOwned: true,
      product: {
        behavior: "pack_container",
        contentsKnown: true,
        packsContained: 8,
        guaranteedProducts: [{ slug: "booster", qty: 8 }],
      },
      takeSealedCount: 3,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.children).toHaveLength(3);
    expect(plan.remainingSealed).toBe(5);
  });

  it("mixed_bundle materializes fixed prints and sealed children", () => {
    const plan = planSealedOpen({
      skuKey: "lorcana::etb",
      countsAsOwned: true,
      product: {
        behavior: "mixed_bundle",
        contentsKnown: true,
        lang: "en",
        guaranteedPrints: [{ printKey: "lorcana:1-promo" }],
        guaranteedProducts: [{ slug: "booster-s1", qty: 8 }],
      },
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.children.filter((c) => c.kind === "card")).toHaveLength(1);
    expect(plan.children.filter((c) => c.kind === "sealed")).toHaveLength(8);
  });

  it("rejects already opened / unknown / preview / random / bad take", () => {
    expect(
      planSealedOpen({
        skuKey: "x::a",
        openedAt: "2026-01-01",
        countsAsOwned: true,
        product: baseProduct,
      }).ok,
    ).toBe(false);
    expect(
      planSealedOpen({
        skuKey: "x::a",
        countsAsOwned: true,
        product: { ...baseProduct, contentsKnown: false },
      }),
    ).toMatchObject({ ok: false, reason: "contents_unknown" });
    expect(
      planSealedOpen({
        skuKey: "x::a",
        countsAsOwned: true,
        product: { ...baseProduct, printsArePreview: true },
      }),
    ).toMatchObject({ ok: false, reason: "preview" });
    expect(
      planSealedOpen({
        skuKey: "x::a",
        countsAsOwned: true,
        product: { ...baseProduct, behavior: "random_pack" },
      }),
    ).toMatchObject({ ok: false, reason: "unsupported_behavior" });
    expect(
      planSealedOpen({
        skuKey: "x::a",
        countsAsOwned: false,
        product: baseProduct,
      }),
    ).toMatchObject({ ok: false, reason: "not_owned" });
    expect(
      planSealedOpen({
        skuKey: "lorcana::display",
        countsAsOwned: true,
        product: {
          behavior: "pack_container",
          contentsKnown: true,
          packsContained: null,
        },
      }),
    ).toMatchObject({ ok: false, reason: "needs_pack_count" });
    expect(
      planSealedOpen({
        skuKey: "lorcana::display",
        countsAsOwned: true,
        product: {
          behavior: "pack_container",
          contentsKnown: true,
          packsContained: 24,
        },
      }),
    ).toMatchObject({ ok: false, reason: "needs_child_slug" });
    expect(
      planSealedOpen({
        skuKey: "lorcana::display",
        countsAsOwned: true,
        product: {
          behavior: "pack_container",
          contentsKnown: true,
          guaranteedProducts: [{ slug: "b", qty: 4 }],
        },
        takeSealedCount: 9,
      }),
    ).toMatchObject({ ok: false, reason: "invalid_take" });
  });
});

describe("planSealedDeclare", () => {
  it("plans one card per declared print", () => {
    const plan = planSealedDeclare({
      skuKey: "lorcana::display",
      countsAsOwned: true,
      defaultLanguage: "fr",
      prints: [
        { printKey: "lorcana:1-1", name: "A" },
        { printKey: "lorcana:1-1" },
        { printKey: "lorcana:1-2", name: "B", language: "en" },
      ],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.children).toEqual([
      {
        kind: "card",
        printKey: "lorcana:1-1",
        name: "A",
        language: "fr",
      },
      {
        kind: "card",
        printKey: "lorcana:1-1",
        name: "lorcana:1-1",
        language: "fr",
      },
      {
        kind: "card",
        printKey: "lorcana:1-2",
        name: "B",
        language: "en",
      },
    ]);
  });

  it("rejects empty / invalid / not owned", () => {
    expect(
      planSealedDeclare({
        skuKey: "x::a",
        countsAsOwned: true,
        prints: [],
      }),
    ).toMatchObject({ ok: false, reason: "empty_declaration" });
    expect(
      planSealedDeclare({
        skuKey: "x::a",
        countsAsOwned: true,
        prints: [{ printKey: "  " }],
      }),
    ).toMatchObject({ ok: false, reason: "invalid_print" });
    expect(
      planSealedDeclare({
        skuKey: "x::a",
        countsAsOwned: false,
        prints: [{ printKey: "a:1" }],
      }),
    ).toMatchObject({ ok: false, reason: "not_owned" });
  });
});
