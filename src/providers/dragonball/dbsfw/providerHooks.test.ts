import { describe, expect, it } from "vitest";

import { dbsfwModule } from "./index";

describe("dbsfw provider hooks", () => {
  it("declares the card-database surface, not just the catalogue", () => {
    expect(dbsfwModule.searchPrints).toBeTypeOf("function");
    expect(dbsfwModule.lookupPrint).toBeTypeOf("function");
    expect(dbsfwModule.suggestDatabaseTitles).toBeTypeOf("function");
    expect(dbsfwModule.runMappingProbe).toBeTypeOf("function");
    expect(dbsfwModule.collectMappingRawKeys).toBeTypeOf("function");
    expect(dbsfwModule.evidence?.label).toBeTruthy();
    expect(dbsfwModule.info.nameDatabase).toBe(true);
    expect(dbsfwModule.info.types).toEqual(["tcg"]);
    expect(dbsfwModule.catalog?.dataPack).toBe("dbs/fw");
  });

  it("lookupPrint ignores Masters printKeys", async () => {
    await expect(
      dbsfwModule.lookupPrint!({
        printKey: "dbscg:bt1-001",
      }),
    ).resolves.toBeNull();
  });
});
