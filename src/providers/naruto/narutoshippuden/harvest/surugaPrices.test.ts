import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { writeSurugaPriceLedger } from "@/providers/naruto/shared/surugaYenPrices";

import {
  harvestSurugaShippudenPrices,
  refreshSurugaShippudenYenPriceOffers,
  surugaShippudenDiskIdFromPrintKey,
} from "./surugaPrices";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("surugaShippudenDiskIdFromPrintKey", () => {
  it("rebuilds shippuden diskIds and rejects Carddass keys", () => {
    expect(surugaShippudenDiskIdFromPrintKey("naruto:shi-0001")).toBe(
      "shi0001",
    );
    expect(surugaShippudenDiskIdFromPrintKey("naruto:gaku-0007")).toBe(
      "gaku0007",
    );
    expect(surugaShippudenDiskIdFromPrintKey("naruto:s1-ni0085")).toBeNull();
  });
});

describe("harvestSurugaShippudenPrices", () => {
  it("writes yen from injected product HTML into a temp ledger", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "suruga-shi-"));
    roots.push(tmp);
    const ledgerPath = path.join(tmp, "suruga-prices.json");
    const result = await harvestSurugaShippudenPrices({
      ledgerPath,
      listings: [{ id: "GL124291", printed: "忍伝-1" }],
      detailHtmlById: new Map([
        [
          "GL124291",
          `<h1>忍伝-1</h1>
           <div data-label="中古"><span class="price-buy">600円 (税込)</span></div>`,
        ],
      ]),
      delayMs: 0,
      limit: 5,
    });
    expect(result.ledger.cardCount).toBe(1);
    expect(result.ledger.cards[0]).toMatchObject({
      diskId: "shi0001",
      printed: "忍伝-1",
      productId: "GL124291",
      priceYen: 600,
    });
  });
});

describe("refreshSurugaShippudenYenPriceOffers", () => {
  it("emits a JPY used offer matched by diskId", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "suruga-shi-offer-"));
    roots.push(tmp);
    const ledgerPath = path.join(tmp, "suruga-prices.json");
    writeSurugaPriceLedger(ledgerPath, {
      source: "test",
      sourceId: "suruga-ya-used",
      packId: "naruto/shippuden",
      fetchedAt: "2026-10-15T00:00:00.000Z",
      cardCount: 1,
      cards: [
        {
          diskId: "shi0001",
          printed: "忍伝-1",
          productId: "GL124291",
          priceYen: 600,
          priceYenCents: 600,
          productUrl: "https://www.suruga-ya.jp/product/detail/GL124291",
          observedAt: "2026-10-15T00:00:00.000Z",
        },
      ],
    });

    const offers = await refreshSurugaShippudenYenPriceOffers(
      {
        shelfType: "tcg",
        cleanedBarcode: "",
        primaryName: "Naruto",
        primaryTitle: "うずまきナルト",
        fallbackNames: [],
        titles: [],
        leDenicheurQueries: [],
        isPal: false,
        isClassics: false,
        printKey: "naruto:shi-0001",
      },
      { ledgerPath },
    );

    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      source: "Suruga-ya",
      condition: "used",
      priceCents: 600,
      currency: "JPY",
    });
  });
});
