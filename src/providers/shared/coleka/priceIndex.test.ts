import { describe, expect, it } from "vitest";

import {
  catalogueColekaPriceQuoteByPrintKey,
  colekaPriceLedgerPathsForPack,
} from "./priceIndex";

describe("coleka priceIndex", () => {
  it("maps known TCG packs to curated ledgers", () => {
    expect(colekaPriceLedgerPathsForPack("bleach/scb")[0]).toMatch(
      /coleka-prices\.json$/,
    );
    expect(colekaPriceLedgerPathsForPack("naruto/carddass")[0]).toMatch(
      /coleka-prices\.json$/,
    );
    expect(colekaPriceLedgerPathsForPack("dragonball/lamincards")[0]).toMatch(
      /coleka-prices\.json$/,
    );
    expect(colekaPriceLedgerPathsForPack("pokemon")[0]).toMatch(
      /coleka-mcdo-prices\.json$/,
    );
    expect(colekaPriceLedgerPathsForPack("lorcana")).toEqual([]);
  });

  const bleachQuotes = catalogueColekaPriceQuoteByPrintKey("bleach/scb");

  it.skipIf(bleachQuotes.size === 0)(
    "loads bleach deals quotes by printKey after harvest",
    () => {
      expect(bleachQuotes.size).toBeGreaterThan(10);
      const ichigo = bleachQuotes.get("bleachscb:a-001");
      expect(ichigo?.priceCents).toBeGreaterThan(0);
    },
  );

  it("loads Lamincards deals quotes by printKey after harvest", () => {
    const quotes = catalogueColekaPriceQuoteByPrintKey("dragonball/lamincards");
    expect(quotes.size).toBeGreaterThan(100);
    expect(quotes.get("dbslamincards:argento-0010")?.priceCents).toBeGreaterThan(
      0,
    );
  });
});
