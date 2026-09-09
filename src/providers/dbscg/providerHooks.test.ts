import { describe, expect, it } from "vitest";

import { dbscgModule } from "./index";

describe("dbscg provider hooks", () => {
  it("declares the card-database surface, not just the catalogue", () => {
    expect(dbscgModule.searchPrints).toBeTypeOf("function");
    expect(dbscgModule.lookupPrint).toBeTypeOf("function");
    expect(dbscgModule.suggestDatabaseTitles).toBeTypeOf("function");
    expect(dbscgModule.runMappingProbe).toBeTypeOf("function");
    expect(dbscgModule.collectMappingRawKeys).toBeTypeOf("function");
    expect(dbscgModule.evidence?.label).toBeTruthy();
    expect(dbscgModule.info.nameDatabase).toBe(true);
    expect(dbscgModule.info.types).toEqual(["tcg"]);
    expect(dbscgModule.catalog?.dataPack).toBe("dbs/cg");
  });

  it("exposes a search and a print-key handler to the admin test panel", () => {
    const handlers = Object.keys(dbscgModule.testHandlers ?? {});
    expect(handlers).toContain("dbscg-search");
    expect(handlers).toContain("dbscg-printkey");
  });

  it("lookupPrint ignores another game's printKey", async () => {
    await expect(
      dbscgModule.lookupPrint!({
        printKey: "naruto:s1-ni001",
      }),
    ).resolves.toBeNull();
  });
});
