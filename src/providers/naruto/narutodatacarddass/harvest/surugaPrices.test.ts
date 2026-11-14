import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { writeSurugaPriceLedger } from "@/providers/naruto/shared/surugaYenPrices";

import {
  harvestSurugaDataCarddassPrices,
  refreshSurugaDataCarddassYenPriceOffers,
  surugaDataCarddassDiskIdFromPrintKey,
  surugaDataCarddassPrintedToDiskId,
} from "./surugaPrices";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("surugaDataCarddassPrintedToDiskId", () => {
  it("normalises DN / NX printed refs", () => {
    expect(surugaDataCarddassPrintedToDiskId("DN-032T")).toBe("dn-032t");
    expect(surugaDataCarddassPrintedToDiskId("NX-001")).toBe("nx-001");
    expect(surugaDataCarddassPrintedToDiskId("忍-85")).toBeNull();
  });
});

describe("surugaDataCarddassDiskIdFromPrintKey", () => {
  it("reads set-number from datacarddass keys only", () => {
    expect(surugaDataCarddassDiskIdFromPrintKey("datacarddass:dn-032t")).toBe(
      "dn-032t",
    );
    expect(surugaDataCarddassDiskIdFromPrintKey("naruto:s1-ni0085")).toBeNull();
  });
});

describe("harvestSurugaDataCarddassPrices", () => {
  it("writes yen from injected product HTML into a temp ledger", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "suruga-dcd-"));
    roots.push(tmp);
    const ledgerPath = path.join(tmp, "suruga-prices.json");
    const result = await harvestSurugaDataCarddassPrices({
      ledgerPath,
      listings: [{ id: "G9008358", printed: "DN-032T" }],
      detailHtmlById: new Map([
        [
          "G9008358",
          `<h1>DN-032T</h1>
           <div data-label="中古"><span class="price-buy">450円 (税込)</span></div>`,
        ],
      ]),
      delayMs: 0,
      limit: 5,
    });
    expect(result.ledger.cardCount).toBe(1);
    expect(result.ledger.cards[0]).toMatchObject({
      diskId: "dn-032t",
      printed: "DN-032T",
      productId: "G9008358",
      priceYen: 450,
    });
  });
});

describe("refreshSurugaDataCarddassYenPriceOffers", () => {
  it("emits a JPY used offer matched by diskId", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "suruga-dcd-offer-"));
    roots.push(tmp);
    const ledgerPath = path.join(tmp, "suruga-prices.json");
    writeSurugaPriceLedger(ledgerPath, {
      source: "test",
      sourceId: "suruga-ya-used",
      packId: "naruto/data-carddass",
      fetchedAt: "2026-10-15T00:00:00.000Z",
      cardCount: 1,
      cards: [
        {
          diskId: "dn-032t",
          printed: "DN-032T",
          productId: "G9008358",
          priceYen: 450,
          priceYenCents: 450,
          productUrl: "https://www.suruga-ya.jp/product/detail/G9008358",
          observedAt: "2026-10-15T00:00:00.000Z",
        },
      ],
    });

    const offers = await refreshSurugaDataCarddassYenPriceOffers(
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
        printKey: "datacarddass:dn-032t",
      },
      { ledgerPath },
    );

    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      source: "Suruga-ya",
      condition: "used",
      priceCents: 450,
      currency: "JPY",
    });
  });
});
