import { describe, expect, it } from "vitest";

import type { ColekaDealOffer } from "@/providers/shared/coleka/deals";

import {
  colekaLamincardsDealParts,
  colekaLamincardsDealsTargets,
} from "./colekaPrices";

function deal(
  partial: Pick<ColekaDealOffer, "refItem" | "title"> &
    Partial<ColekaDealOffer>,
): ColekaDealOffer {
  return {
    colekaId: partial.colekaId ?? "1",
    rubriqueId: partial.rubriqueId ?? "13562",
    refItem: partial.refItem,
    title: partial.title ?? null,
    quotationEuro: null,
    offerEuro: null,
    shippingEuro: null,
    marketplace: null,
    externalId: null,
    observedAt: null,
    affiliatePath: null,
  };
}

describe("colekaLamincardsDealParts", () => {
  it("reads checklist numbers and Silver/Gold from the title", () => {
    expect(colekaLamincardsDealParts("037", "Carte 037 Silver")).toEqual({
      number: "37",
      grouping: "s",
    });
    expect(colekaLamincardsDealParts("035", "Carte 035 Gold")).toEqual({
      number: "35",
      grouping: "g",
    });
    expect(colekaLamincardsDealParts("010", "Carte Dragon Ball n°10")).toEqual({
      number: "10",
      grouping: null,
    });
    expect(colekaLamincardsDealParts("", "Album")).toBeNull();
    expect(colekaLamincardsDealParts("Album", null)).toBeNull();
  });
});

describe("colekaLamincardsDealsTargets", () => {
  it("covers mapped leaves only — never the hub", () => {
    const ids = colekaLamincardsDealsTargets().map((t) => t.rubriqueId);
    expect(ids).toEqual(["13562", "13565", "13561", "7090", "7091"]);
    expect(ids).not.toContain("4591");
  });

  it("resolves Argento / FR Silver / Or Gold printKeys", () => {
    const targets = colekaLamincardsDealsTargets();
    const argento = targets.find((t) => t.rubriqueId === "13562")!;
    const fr2008 = targets.find((t) => t.rubriqueId === "7090")!;
    const fror = targets.find((t) => t.rubriqueId === "7091")!;
    expect(
      argento.resolvePrintKey(
        deal({ refItem: "010", title: "Carte Dragon Ball n°10" }),
      ),
    ).toBe("dbslamincards:argento-0010");
    expect(
      fr2008.resolvePrintKey(
        deal({ refItem: "008", title: "Carte 008 Silver" }),
      ),
    ).toBe("dbslamincards:fr2008-0008-s");
    expect(
      fror.resolvePrintKey(deal({ refItem: "035", title: "Carte 035 Gold" })),
    ).toBe("dbslamincards:fror-0035-g");
  });
});
