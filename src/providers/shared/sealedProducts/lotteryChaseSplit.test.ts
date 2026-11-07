import { describe, expect, it } from "vitest";

import {
  sealedFixeezLotteryRole,
  sealedLotteryDisplayPools,
  sealedLotteryPoolForSku,
  sealedPrintLooksLikeFixeezChase,
  splitSealedLotteryChasePrints,
} from "./lotteryChaseSplit";
import type { PackCompositionField } from "./packCompositionTypes";

const CARD = {
  printKey: "leclerc:marvel23-001",
  name: "Spider-Man",
  slug: "leclerc:marvel23-001",
  ref: null,
};
const FIXEEZ = {
  printKey: "leclerc:marvel23-f01",
  name: "Fixeez — Groot",
  slug: "leclerc:marvel23-f01",
  ref: null,
};

const POCHETTE_4: PackCompositionField = {
  provenance: "structural",
  slots: [{ id: "card", count: 4, kind: "dedicated", rarities: ["card"] }],
  rarityHits: {},
  cardsPerPack: 4,
};

const POCHETTE_4_CHASE: PackCompositionField = {
  ...POCHETTE_4,
  possibleChase: ["Fixeez"],
};

const POCHETTE_FIXEEZ: PackCompositionField = {
  provenance: "structural",
  slots: [{ id: "fixeez", count: 1, kind: "dedicated", rarities: ["Fixeez"] }],
  rarityHits: {},
  cardsPerPack: 1,
};

describe("lotteryChaseSplit", () => {
  it("detects Leclerc Fixeez printKeys and titles", () => {
    expect(
      sealedPrintLooksLikeFixeezChase({
        printKey: "leclerc:disney25-f01",
        name: "Fixeez — Mickey",
        slug: "leclerc:disney25-f01",
        ref: null,
      }),
    ).toBe(true);
    expect(
      sealedPrintLooksLikeFixeezChase({
        printKey: "leclerc:disney25-001",
        name: "Lilo",
        slug: "leclerc:disney25-001",
        ref: null,
      }),
    ).toBe(false);
  });

  it("keeps chase out of the base lottery section (not guaranteed)", () => {
    const { base, chase } = splitSealedLotteryChasePrints([CARD, FIXEEZ]);
    expect(base.map((p) => p.printKey)).toEqual([CARD.printKey]);
    expect(chase.map((p) => p.printKey)).toEqual([FIXEEZ.printKey]);
  });

  it("roles Fixeez from packComposition (marvel23 vs disney25 vs pochette-fixeez)", () => {
    expect(sealedFixeezLotteryRole(POCHETTE_4)).toBe("exclude");
    expect(sealedFixeezLotteryRole(POCHETTE_4_CHASE)).toBe("optional");
    expect(sealedFixeezLotteryRole(POCHETTE_FIXEEZ)).toBe("primary");
    expect(sealedFixeezLotteryRole("none")).toBe("exclude");
  });

  it("hides Fixeez possibles on marvel23-style 4-card pochette", () => {
    const { base, optionalChase } = sealedLotteryDisplayPools(
      [CARD, FIXEEZ],
      POCHETTE_4,
    );
    expect(base.map((p) => p.printKey)).toEqual([CARD.printKey]);
    expect(optionalChase).toEqual([]);
  });

  it("keeps optional Fixeez section when possibleChase attests it", () => {
    const { base, optionalChase } = sealedLotteryDisplayPools(
      [CARD, FIXEEZ],
      POCHETTE_4_CHASE,
    );
    expect(base.map((p) => p.printKey)).toEqual([CARD.printKey]);
    expect(optionalChase.map((p) => p.printKey)).toEqual([FIXEEZ.printKey]);
  });

  it("shows Fixeez as primary pool for dedicated Fixeez pochette", () => {
    const { base, optionalChase } = sealedLotteryDisplayPools(
      [CARD, FIXEEZ],
      POCHETTE_FIXEEZ,
    );
    expect(base.map((p) => p.printKey)).toEqual([FIXEEZ.printKey]);
    expect(optionalChase).toEqual([]);
  });

  it("SKU lottery pool drops the 108 cards on pochette-fixeez", () => {
    expect(
      sealedLotteryPoolForSku([CARD, FIXEEZ], POCHETTE_FIXEEZ).map(
        (p) => p.printKey,
      ),
    ).toEqual([FIXEEZ.printKey]);
    expect(
      sealedLotteryPoolForSku([CARD, FIXEEZ], POCHETTE_4).map((p) => p.printKey),
    ).toEqual([CARD.printKey]);
    expect(
      sealedLotteryPoolForSku([CARD, FIXEEZ], POCHETTE_4_CHASE).map(
        (p) => p.printKey,
      ),
    ).toEqual([CARD.printKey, FIXEEZ.printKey]);
  });
});


