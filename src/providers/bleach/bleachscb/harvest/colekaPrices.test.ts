import { describe, expect, it } from "vitest";

import type { ColekaDealOffer } from "@/providers/shared/coleka/deals";

import { colekaBleachPriceLedgerPath } from "./colekaPrices";
import { bleachScbPrintKey, parseBleachScbPrinted } from "../printKey";
import { normalizeColekaRefItem } from "@/providers/shared/coleka/deals";

describe("harvestColekaBleachS1Prices helpers", () => {
  it("ledger path ends with coleka-prices.json", () => {
    expect(colekaBleachPriceLedgerPath()).toMatch(/coleka-prices\.json$/);
  });

  it("resolves Coleka ref to bleach printKey", () => {
    const deal: ColekaDealOffer = {
      colekaId: "1594671",
      rubriqueId: "37171",
      refItem: "A 015",
      title: "Isshin",
      quotationEuro: 4.6,
      offerEuro: 80.16,
      shippingEuro: 0,
      marketplace: "eBay",
      externalId: "1",
      observedAt: null,
      affiliatePath: null,
    };
    const compact = normalizeColekaRefItem(deal.refItem)!;
    const parsed = parseBleachScbPrinted(compact)!;
    expect(bleachScbPrintKey(parsed.set, parsed.number)).toBe(
      "bleachscb:a-015",
    );
  });
});
