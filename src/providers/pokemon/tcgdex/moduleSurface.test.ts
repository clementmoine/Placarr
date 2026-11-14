import { describe, expect, it } from "vitest";

import { tcgdexModule } from "./index";

describe("tcgdex harvest / enrich / price surface", () => {
  it("keeps catalog + price and drops picker / checklist hooks", () => {
    expect(tcgdexModule.info.catalogueLabel).toBeUndefined();
    expect(tcgdexModule.info.nameDatabase).toBeFalsy();
    expect(tcgdexModule.info.referencePriceSource).toBe(true);
    expect(tcgdexModule.catalog?.dataPack).toBe("pokemon");
    expect(tcgdexModule.createMetadataAdapter).toBeTypeOf("function");
    expect(tcgdexModule.refreshBarcodePriceOffers).toBeTypeOf("function");
    expect(tcgdexModule.searchPrints).toBeUndefined();
    expect(tcgdexModule.lookupPrint).toBeUndefined();
    expect(tcgdexModule.listPrintSets).toBeUndefined();
    expect(tcgdexModule.listSetPrints).toBeUndefined();
    expect(tcgdexModule.loadBoosterComposition).toBeUndefined();
    // printGames stays for gallery / cover attribution; picker hooks stay off.
    expect(tcgdexModule.printGames).toEqual(["pokemon"]);
  });
});
