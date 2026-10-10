import { describe, expect, it } from "vitest";

import { dealToColekaPriceRow, mergeColekaPriceRows } from "./dealsHarvest";
import type { ColekaDealOffer } from "./deals";

describe("coleka dealsHarvest", () => {
  it("maps deals to rows with printKey resolver", () => {
    const deal: ColekaDealOffer = {
      colekaId: "1",
      rubriqueId: "37171",
      refItem: "A 015",
      title: "Isshin",
      quotationEuro: 4.6,
      offerEuro: 80.16,
      shippingEuro: 0,
      marketplace: "eBay",
      externalId: "x",
      observedAt: "2026-09-19 08:18:37",
      affiliatePath: "/oo/1",
    };
    const row = dealToColekaPriceRow(deal, {
      resolvePrintKey: () => "bleachscb:a-015",
      resolvePrinted: () => "A015",
    });
    expect(row).toMatchObject({
      printKey: "bleachscb:a-015",
      printed: "A015",
      quotationCents: 460,
      offerCents: 8016,
    });
  });

  it("merges duplicate printKeys preferring quotation", () => {
    const base = {
      colekaId: "1",
      rubriqueId: "1",
      refItem: "A 001",
      title: "x",
      shippingEuro: null,
      marketplace: null,
      observedAt: "2026-09-01",
      affiliatePath: null,
      quotationEuro: null as number | null,
      quotationCents: null as number | null,
      offerEuro: 10,
      offerCents: 1000,
      printKey: "bleachscb:a-001",
      printed: "A001",
    };
    const withQuote = {
      ...base,
      colekaId: "2",
      quotationEuro: 82,
      quotationCents: 8200,
      observedAt: "2026-09-02",
    };
    const merged = mergeColekaPriceRows([base, withQuote]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.quotationCents).toBe(8200);
  });
});
