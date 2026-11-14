import { describe, expect, it } from "vitest";

import {
  normalizeColekaRefItem,
  parseColekaDealEntry,
  parseColekaDealsPayload,
  parseColekaEuro,
  uniqueColekaDealsByItem,
} from "./deals";

const SAMPLE_DEAL = {
  raw: {
    url: "/oo/1594671/ebay/820098147205/fr",
    titre_item: "Isshin Kurusoki",
    prix: "80€",
    price_in_euro: "80.16",
    shipping: "0.00",
    offername: "eBay",
  },
  op: {
    id_rubrique: 37171,
    current_quotation_in_euro: "4.60",
    ref_item: "A 015",
    id_item: 1594671,
    price_in_euro: "80.16",
    shipping: "0.00",
    dt_op: "2026-09-19 08:18:37",
    id_externe: 820098147205,
    type_externe: "ebay",
  },
};

describe("coleka deals", () => {
  it.each([
    ["4.60", 4.6],
    ["80.16", 80.16],
    ["10€", 10],
    ["1,50", 1.5],
    ["", null],
    [null, null],
  ] as const)("parseColekaEuro(%j) → %j", (input, expected) => {
    expect(parseColekaEuro(input)).toBe(expected);
  });

  it.each([
    ["A 001", "A001"],
    ["A 15", "A015"],
    ["Z 002", "Z002"],
    ["P 007", "P007"],
    ["C 004", "C004"],
    ["", null],
    [null, null],
  ] as const)("normalizeColekaRefItem(%j) → %j", (input, expected) => {
    expect(normalizeColekaRefItem(input)).toBe(expected);
  });

  it("parses a deals ajax row into quotation + offer", () => {
    const offer = parseColekaDealEntry(SAMPLE_DEAL);
    expect(offer).toMatchObject({
      colekaId: "1594671",
      rubriqueId: "37171",
      refItem: "A 015",
      title: "Isshin Kurusoki",
      quotationEuro: 4.6,
      offerEuro: 80.16,
      shippingEuro: 0,
      marketplace: "eBay",
      externalId: "820098147205",
      affiliatePath: "/oo/1594671/ebay/820098147205/fr",
    });
  });

  it("collapses duplicate id_item keeping the latest observedAt", () => {
    const older = parseColekaDealEntry({
      ...SAMPLE_DEAL,
      op: { ...SAMPLE_DEAL.op, price_in_euro: "1.00", dt_op: "2026-09-01 00:00:00" },
      raw: { ...SAMPLE_DEAL.raw, price_in_euro: "1.00" },
    })!;
    const newer = parseColekaDealEntry(SAMPLE_DEAL)!;
    const uniq = uniqueColekaDealsByItem([older, newer]);
    expect(uniq).toHaveLength(1);
    expect(uniq[0]!.offerEuro).toBe(80.16);
  });

  it("ignores non-array payloads", () => {
    expect(parseColekaDealsPayload({ change: false })).toEqual([]);
    expect(parseColekaDealsPayload(null)).toEqual([]);
  });
});
