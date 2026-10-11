import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  harvestSurugaCarddassPrices,
  readSurugaPriceLedger,
  refreshSurugaYenPriceOffers,
  surugaDiskIdFromPrintKey,
  writeSurugaPriceLedger,
} from "./surugaPrices";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("surugaDiskIdFromPrintKey", () => {
  it("reads the collector segment of a set-scoped key", () => {
    expect(surugaDiskIdFromPrintKey("naruto:s1-ni0085")).toBe("ni0085");
    expect(surugaDiskIdFromPrintKey("naruto:maki1-ni0001")).toBe("ni0001");
    expect(surugaDiskIdFromPrintKey("pokemon:swsh3-1")).toBeNull();
  });
});

describe("refreshSurugaYenPriceOffers", () => {
  it("emits a JPY used offer matched by diskId", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "suruga-offer-"));
    roots.push(tmp);
    const ledgerPath = path.join(tmp, "suruga-prices.json");
    writeSurugaPriceLedger(ledgerPath, {
      source: "test",
      sourceId: "suruga-ya-used",
      packId: "naruto/carddass",
      fetchedAt: "2026-10-10T00:00:00.000Z",
      cardCount: 1,
      cards: [
        {
          diskId: "ni0085",
          printed: "忍-85",
          productId: "GL410631",
          priceYen: 1200,
          priceYenCents: 1200,
          productUrl: "https://www.suruga-ya.jp/product/detail/GL410631",
          observedAt: "2026-10-10T00:00:00.000Z",
        },
      ],
    });

    const offers = await refreshSurugaYenPriceOffers(
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
        printKey: "naruto:s1-ni0085",
      },
      { ledgerPath },
    );

    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      source: "Suruga-ya",
      condition: "used",
      priceCents: 1200,
      currency: "JPY",
      metadataScoped: true,
      sourceUrl: "https://www.suruga-ya.jp/product/detail/GL410631",
    });
  });
});

describe("harvestSurugaCarddassPrices", () => {
  it("writes yen from injected product HTML into a temp ledger", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "suruga-harvest-"));
    roots.push(tmp);
    const ledgerPath = path.join(tmp, "suruga-prices.json");
    const result = await harvestSurugaCarddassPrices({
      ledgerPath,
      listings: [{ id: "GL410631", printed: "忍-85" }],
      detailHtmlById: new Map([
        [
          "GL410631",
          `<h1>忍-85[ウルトラレア]</h1>
           <div data-label="中古"><span class="price-buy">900円 (税込)</span></div>`,
        ],
      ]),
      delayMs: 0,
      limit: 5,
    });
    expect(result.ledger.cardCount).toBe(1);
    expect(result.ledger.cards[0]).toMatchObject({
      diskId: "ni0085",
      printed: "忍-85",
      productId: "GL410631",
      priceYen: 900,
      priceYenCents: 900,
    });
    expect(readSurugaPriceLedger(ledgerPath)?.cards).toHaveLength(1);
  });
});
