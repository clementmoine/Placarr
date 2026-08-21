import { describe, expect, it } from "vitest";

import { martinaIngestPackshots, martinaLedger } from "./martinaPackshots";
import { narutoCatalogueLineForSealed } from "./packs";

describe("Martina’s Fumetti S6 IT starter", () => {
  it("keeps the pasted box as Il Fascino del Male, not a booster", () => {
    const ledger = martinaLedger();
    expect(ledger.ingestCatalog).toBe(false);
    expect(martinaIngestPackshots().map((row) => row.slug)).toEqual([
      "starter-il-fascino-del-male",
    ]);
    const row = ledger.products[0]!;
    expect(row.setCode).toBe("s6");
    expect(row.kind).toBe("deck");
    expect(row.lang).toBe("IT");
    expect(row.printedRef).toBe("93214");
    expect(row.url).toContain("141556-product_main_2x");
    expect(row.staging).toBe("staging/martina/starter-il-fascino-del-male.jpg");
  });

  it("files the Italian S6 starter on CACG, not Bandai CCG", () => {
    expect(
      narutoCatalogueLineForSealed({
        slug: "starter-il-fascino-del-male",
        setCode: "s6",
        lang: "IT",
      }),
    ).toBe("carddass-fr");
  });
});
