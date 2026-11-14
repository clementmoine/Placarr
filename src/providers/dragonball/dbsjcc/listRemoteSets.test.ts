import { describe, expect, it } from "vitest";

import { listDbsjccRemoteSets } from "./listRemoteSets";
import { isDbsjccCardCatalogueSetCode } from "./printKey";

describe("isDbsjccCardCatalogueSetCode", () => {
  it("keeps series / promo / SP / accessory, drops Super Série and Tin box", () => {
    expect(isDbsjccCardCatalogueSetCode("part1")).toBe(true);
    expect(isDbsjccCardCatalogueSetCode("promo")).toBe(true);
    expect(isDbsjccCardCatalogueSetCode("sp")).toBe(true);
    expect(isDbsjccCardCatalogueSetCode("accessory")).toBe(true);
    expect(isDbsjccCardCatalogueSetCode("ss1")).toBe(false);
    expect(isDbsjccCardCatalogueSetCode("ss6")).toBe(false);
    expect(isDbsjccCardCatalogueSetCode("tinbox")).toBe(false);
  });
});

describe("listDbsjccRemoteSets", () => {
  it("does not announce Super Série / Tin box as empty card sets", () => {
    const ids = listDbsjccRemoteSets("fr").map((s) => s.id);
    expect(ids.some((id) => /^ss\d+$/.test(id))).toBe(false);
    expect(ids).not.toContain("tinbox");
    // Main series + hors-série still present when sealed/products exist.
    expect(ids).toEqual(
      expect.arrayContaining(["part1", "promo", "sp", "accessory"]),
    );
  });
});
