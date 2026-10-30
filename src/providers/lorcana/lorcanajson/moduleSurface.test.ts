import { describe, expect, it } from "vitest";

import { lorcanajsonModule } from "./index";

describe("lorcanajson enrich-only surface", () => {
  it("keeps metadata enrich and drops picker / checklist hooks", () => {
    expect(lorcanajsonModule.info.catalogueLabel).toBeUndefined();
    expect(lorcanajsonModule.info.nameDatabase).toBeFalsy();
    expect(lorcanajsonModule.createMetadataAdapter).toBeTypeOf("function");
    expect(lorcanajsonModule.searchPrints).toBeUndefined();
    expect(lorcanajsonModule.lookupPrint).toBeUndefined();
    expect(lorcanajsonModule.listPrintSets).toBeUndefined();
    expect(lorcanajsonModule.listSetPrints).toBeUndefined();
    expect(lorcanajsonModule.loadBoosterComposition).toBeUndefined();
    // printGames stays for gallery / cover attribution; picker hooks stay off.
    expect(lorcanajsonModule.printGames).toEqual(["lorcana"]);
  });
});
