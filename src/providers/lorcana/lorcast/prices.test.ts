import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  lorcastFillPriceRowForPrint,
  lorcastPricesFromRaw,
  lorcastUsdToCents,
  readLorcastFillPriceLedger,
  writeLorcastFillPriceLedger,
} from "./prices";

describe("lorcastUsdToCents", () => {
  it("maps dollars to cents and drops non-positive", () => {
    expect(lorcastUsdToCents("14.11")).toBe(1411);
    expect(lorcastUsdToCents(0.14)).toBe(14);
    expect(lorcastUsdToCents("0")).toBeNull();
    expect(lorcastUsdToCents(null)).toBeNull();
  });
});

describe("lorcastPricesFromRaw", () => {
  it("reads usd / usd_foil", () => {
    expect(lorcastPricesFromRaw({ usd: "1.00", usd_foil: "2.50" })).toEqual({
      usd: 100,
      usdFoil: 250,
    });
  });
});

describe("lorcast fill price ledger", () => {
  it("merges priced gap-fill rows by printKey", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lorcast-fill-prices-"));
    const ledgerPath = path.join(dir, "lorcast-fill-prices.json");
    const row = lorcastFillPriceRowForPrint({
      printKey: "lorcana:p2-36",
      setCode: "P2",
      collectorNumber: "36",
      name: "Mickey Mouse - True Friend",
      tcgplayerId: 99,
      prices: { usd: null, usdFoil: 1411 },
    });
    expect(row).not.toBeNull();
    writeLorcastFillPriceLedger([row!], ledgerPath);
    writeLorcastFillPriceLedger(
      [
        lorcastFillPriceRowForPrint({
          printKey: "lorcana:p2-1",
          setCode: "P2",
          collectorNumber: "1",
          name: "Other",
          tcgplayerId: null,
          prices: { usd: 50, usdFoil: null },
        })!,
      ],
      ledgerPath,
    );
    const ledger = readLorcastFillPriceLedger(ledgerPath);
    expect(Object.keys(ledger.byPrintKey).sort()).toEqual([
      "lorcana:p2-1",
      "lorcana:p2-36",
    ]);
    expect(ledger.byPrintKey["lorcana:p2-36"]?.prices.usdFoil).toBe(1411);
    const raw = JSON.parse(readFileSync(ledgerPath, "utf8")) as {
      version: number;
    };
    expect(raw.version).toBe(1);
  });

  it("skips rows with no USD at all", () => {
    expect(
      lorcastFillPriceRowForPrint({
        printKey: "lorcana:p2-2",
        setCode: "P2",
        collectorNumber: "2",
        name: "Empty",
        tcgplayerId: null,
        prices: { usd: null, usdFoil: null },
      }),
    ).toBeNull();
  });
});
