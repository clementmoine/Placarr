import { describe, expect, it } from "vitest";

import {
  filterObservationsByOutlierTrim,
  filterUsedPricesAboveNew,
  trimPriceOutlierCents,
} from "./outlierTrim";

describe("trimPriceOutlierCents", () => {
  it("keeps pairs and tight clusters untouched", () => {
    expect(trimPriceOutlierCents([890, 1200])).toEqual([890, 1200]);
    expect(trimPriceOutlierCents([1500, 1600, 1700])).toEqual([
      1500, 1600, 1700,
    ]);
  });

  it("drops a single high outlier among three or four samples", () => {
    expect(trimPriceOutlierCents([890, 1200, 100_000])).toEqual([890, 1200]);
    expect(trimPriceOutlierCents([899, 2278, 2995, 7190])).toEqual([
      899, 2278, 2995,
    ]);
  });
});

describe("filterObservationsByOutlierTrim", () => {
  it("removes trimmed rows from the observation list", () => {
    const filtered = filterObservationsByOutlierTrim(
      [
        { source: "A", condition: "new", priceCents: 899 },
        { source: "B", condition: "new", priceCents: 2278 },
        { source: "C", condition: "new", priceCents: 2995 },
        { source: "D", condition: "new", priceCents: 7190 },
        { source: "E", condition: "used", priceCents: 16697 },
      ],
      ["new"],
    );

    expect(filtered.map((row) => row.source)).toEqual(["A", "B", "C", "E"]);
  });
});

describe("filterUsedPricesAboveNew", () => {
  it("drops used listings above the cheapest new price when both exist", () => {
    const filtered = filterUsedPricesAboveNew(
      [
        { source: "ChocoBonPlan", condition: "new", priceCents: 1499 },
        { source: "Smartoys", condition: "new", priceCents: 3995 },
        { source: "Smartoys", condition: "used", priceCents: 4999 },
        { source: "eBay", condition: "used", priceCents: 16453 },
      ],
      "games",
    );

    expect(filtered.map((row) => `${row.source}:${row.condition}`)).toEqual([
      "ChocoBonPlan:new",
      "Smartoys:new",
    ]);
  });

  it("keeps used CIB below the new ceiling", () => {
    const filtered = filterUsedPricesAboveNew(
      [
        { source: "AchatMoinsCher", condition: "new", priceCents: 2278 },
        { source: "PriceCharting", condition: "cib", priceCents: 1671 },
      ],
      "games",
    );

    expect(filtered).toHaveLength(2);
  });

  it("keeps reference-catalog used prices above a cheap marketplace new ceiling", () => {
    const filtered = filterUsedPricesAboveNew(
      [
        { source: "ChocoBonPlan", condition: "new", priceCents: 3100, productName: "Transistor sur PS4" },
        { source: "PriceCharting", condition: "loose", priceCents: 7024 },
      ],
      "games",
      (source) => source === "PriceCharting",
    );

    expect(filtered.map((row) => `${row.source}:${row.condition}`)).toEqual([
      "ChocoBonPlan:new",
      "PriceCharting:loose",
    ]);
  });

  it("ignores unnamed new listings when setting the used ceiling", () => {
    const filtered = filterUsedPricesAboveNew(
      [
        { source: "PriceCharting", condition: "new", priceCents: 7734 },
        { source: "AchatMoinsCher", condition: "new", priceCents: 817 },
        { source: "PriceCharting", condition: "loose", priceCents: 3300 },
        { source: "AchatMoinsCher", condition: "used", priceCents: 119 },
      ],
      "games",
      (source) => source === "PriceCharting",
    );

    expect(filtered.map((row) => `${row.source}:${row.condition}`)).toEqual([
      "PriceCharting:new",
      "AchatMoinsCher:new",
      "PriceCharting:loose",
      "AchatMoinsCher:used",
    ]);
  });

  it("leaves observations untouched when no new price is available", () => {
    const rows = [{ source: "Smartoys", condition: "used", priceCents: 1200 }];
    expect(filterUsedPricesAboveNew(rows, "games")).toEqual(rows);
  });
});
