import { describe, expect, it } from "vitest";

import { ownershipSetFromPrintKey } from "@/core/collect/checklistOwnership";

import {
  isLorcanaMainCatalogueSetCode,
  isLorcanaPromoPrint,
  lorcanaPromoChecklistSeries,
  lorcanaPromoGroupingForSetId,
  lorcanaSetScopeWhere,
  normalizeLorcanaPromoGrouping,
} from "./promoSeries";

describe("isLorcanaMainCatalogueSetCode", () => {
  it.each(["1", "13", "Q1", "q2", "Q3"])("keeps %s as main catalogue", (code) => {
    expect(isLorcanaMainCatalogueSetCode(code)).toBe(true);
  });

  it.each(["P2", "C2", "Coconut", "p1", ""])(
    "does not treat %s as a main chapter",
    (code) => {
      expect(isLorcanaMainCatalogueSetCode(code)).toBe(false);
    },
  );
});

describe("normalizeLorcanaPromoGrouping", () => {
  it("clears quest self-stamps (Lorcast Q3 bug)", () => {
    expect(normalizeLorcanaPromoGrouping("Q3", "Q3")).toBeNull();
    expect(normalizeLorcanaPromoGrouping("q2", "Q2")).toBeNull();
    expect(normalizeLorcanaPromoGrouping("14", "14")).toBeNull();
  });

  it("keeps real promo groupings under a retail chapter", () => {
    expect(normalizeLorcanaPromoGrouping("1", "P1")).toBe("P1");
    expect(normalizeLorcanaPromoGrouping("P2", "P2")).toBe("P2");
  });
});

describe("lorcanaPromoChecklistSeries", () => {
  it("maps P1/P2/P3 to Promo Year N", () => {
    expect(lorcanaPromoChecklistSeries("P1")).toEqual({
      id: "p1",
      code: "P1",
      label: "Promo Year 1",
      sortKey: 51,
    });
    expect(lorcanaPromoChecklistSeries("p3")).toMatchObject({
      id: "p3",
      label: "Promo Year 3",
      sortKey: 53,
    });
  });

  it("maps PD1 to Product Year 1", () => {
    expect(lorcanaPromoChecklistSeries("PD1")).toEqual({
      id: "pd1",
      code: "PD1",
      label: "Product Year 1",
      sortKey: 61,
    });
  });

  it("maps DIS to Discover Promo", () => {
    expect(lorcanaPromoChecklistSeries("DIS")).toEqual({
      id: "dis",
      code: "DIS",
      label: "Discover Promo",
      sortKey: 80,
    });
    expect(lorcanaPromoChecklistSeries("dis")?.label).toBe("Discover Promo");
  });

  it("maps RPH to Ravensburger Play Hub", () => {
    expect(lorcanaPromoChecklistSeries("RPH")).toEqual({
      id: "rph",
      code: "RPH",
      label: "Ravensburger Play Hub",
      sortKey: 85,
    });
    expect(lorcanaPromoChecklistSeries("rph")?.label).toBe(
      "Ravensburger Play Hub",
    );
  });

  it("keeps challenge and other groupings as their own series", () => {
    expect(lorcanaPromoChecklistSeries("C2")).toMatchObject({
      id: "c2",
      code: "C2",
      label: "Challenge 2",
    });
    expect(lorcanaPromoChecklistSeries("Coconut")?.id).toBe("coconut");
  });
});

describe("lorcanaPromoGroupingForSetId", () => {
  it("resolves checklist ids back to promo_grouping", () => {
    expect(lorcanaPromoGroupingForSetId("p1")).toBe("P1");
    expect(lorcanaPromoGroupingForSetId("pd1")).toBe("PD1");
    expect(lorcanaPromoGroupingForSetId("c2")).toBe("C2");
    expect(lorcanaPromoGroupingForSetId("coconut")).toBe("COCONUT");
    expect(lorcanaPromoGroupingForSetId("2")).toBeNull();
  });
});

describe("isLorcanaPromoPrint", () => {
  it("detects a non-empty promo grouping", () => {
    expect(isLorcanaPromoPrint("P1")).toBe(true);
    expect(isLorcanaPromoPrint("  ")).toBe(false);
    expect(isLorcanaPromoPrint(null)).toBe(false);
  });
});

describe("Lorcana checklist ownership registration", () => {
  it("maps promo printKeys onto Promo Year set ids", () => {
    expect(ownershipSetFromPrintKey("lorcana:13-16-p4", "13")).toBe("p4");
    expect(ownershipSetFromPrintKey("lorcana:9-34-p3", "9")).toBe("p3");
    expect(ownershipSetFromPrintKey("lorcana:13-16", "13")).toBe("13");
  });
});

describe("lorcanaSetScopeWhere", () => {
  it("scopes Promo Year 1 by promo_grouping P1", () => {
    const scope = lorcanaSetScopeWhere({ setId: "p1" });
    expect(scope.where).toContain("promo_grouping");
    expect(scope.params).toEqual(["P1"]);
  });

  it("excludes promo reprints from a numbered chapter", () => {
    const scope = lorcanaSetScopeWhere({ setId: "2" });
    expect(scope.where).toMatch(/LOWER\(p\.set_code\) = \?/i);
    expect(scope.where).toMatch(/NOT \(/);
    expect(scope.params).toEqual(["2"]);
  });

  it("scopes Coconut by exact grouping", () => {
    const scope = lorcanaSetScopeWhere({ setId: "coconut" });
    expect(scope.params).toEqual(["COCONUT"]);
  });

  it("keeps text params after the set binding", () => {
    const scope = lorcanaSetScopeWhere({
      setId: "p2",
      textClause: "LOWER(t.full_name) LIKE ?",
      textParams: ["%elsa%"],
    });
    expect(scope.params).toEqual(["P2", "%elsa%"]);
  });
});
