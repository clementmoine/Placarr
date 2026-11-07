import { describe, expect, it } from "vitest";

import {
  classicGgNumberToPrintKey,
  indexGgPrices,
  kayouGgNumberToCard,
  mythosGgNumberToPrintKey,
  parseGgPriceAmount,
} from "./ggArchivePrices";

describe("parseGgPriceAmount", () => {
  it("parses USD and EUR", () => {
    expect(parseGgPriceAmount("$0.70")).toEqual({
      cents: 70,
      currency: "USD",
    });
    expect(parseGgPriceAmount("$11.50")).toEqual({
      cents: 1150,
      currency: "USD",
    });
    expect(parseGgPriceAmount("1.14 USD")).toEqual({
      cents: 114,
      currency: "USD",
    });
  });
});

describe("classicGgNumberToPrintKey", () => {
  it("pads classic collector ids", () => {
    expect(classicGgNumberToPrintKey("j023")).toBe("naruto:j-0023");
    expect(classicGgNumberToPrintKey("n088")).toBe("naruto:n-0088");
  });
});

describe("kayouGgNumberToCard", () => {
  it("dots Kayou printed ids", () => {
    expect(kayouGgNumberToCard("NRZ08-SR-003")).toBe("nrz08.sr.003");
  });
});

describe("mythosGgNumberToPrintKey", () => {
  it("maps KS numbers to ks1 prints", () => {
    expect(mythosGgNumberToPrintKey("KS-007")).toBe("mythos:ks1-0007");
  });
});

describe("indexGgPrices", () => {
  it("indexes lowest price per printKey", () => {
    const map = indexGgPrices(
      {
        rows: [
          { name: "A", price: "$2.00", number: "j001" },
          { name: "A cheap", price: "$0.70", number: "j001" },
        ],
      },
      (row) => classicGgNumberToPrintKey(row.number ?? ""),
    );
    expect(map.get("naruto:j-0001")).toMatchObject({
      cents: 70,
      currency: "USD",
    });
  });
});
