import { describe, expect, it } from "vitest";

import { narutoDiskCardId } from "./collectorIdentity";
import { mercariIngestFaces, mercariLedger } from "./mercari";

describe("mercari 忍-3 leads", () => {
  it("does not crawl live search", () => {
    expect(mercariLedger().crawlLive).toBe(false);
    expect(mercariLedger().ingest).toBe("curated-faces");
    expect(mercariLedger().not).toContain("opni-as-ni0003");
  });

  it("ingests 巻ノ壱 忍-3 and rejects pasted OP忍-3 titles", () => {
    expect(mercariIngestFaces().map((row) => row.printedRef)).toEqual([
      "忍-3",
      "忍-20",
      "忍-1（PS）",
      "忍-2（PS）",
      "忍-3（PS）",
      "忍-11（PS）",
    ]);
    expect(mercariIngestFaces()[0]?.listing).toBe(
      "https://jp.mercari.com/item/m63902869042",
    );
    expect(mercariIngestFaces()[0]?.bandaiYear).toBe(2002);
    expect(narutoDiskCardId("忍-3")).toBe("ni0003");
    const rejected = mercariLedger().faces.filter(
      (row) => row.ingest === false,
    );
    // The OP忍-3 rejects are an *identity* call: a 2005 promo wearing the same
    // name. They must stay rejected whatever else lands in the ledger.
    const opRejects = rejected.filter((row) => row.printedRef === "OP忍-3");
    expect(opRejects.map((row) => row.listing)).toEqual([
      "https://www.cafr.ebay.ca/itm/185397519690",
      "https://www.ebay.com/itm/235949420497",
      "https://jp.mercari.com/item/m90117035741",
      "https://jp.mercari.com/item/m54760516214",
      "https://item.fril.jp/fe3228355049173d7f63cc04e45260ed",
      "https://www.ebay.com/itm/175873810783",
      "https://www.ebay.com/itm/196448894281",
    ]);
    expect(opRejects).toHaveLength(7);
  });

  it("keeps the （PS） pre-order cards off their booster numbers", () => {
    const ps = mercariIngestFaces().filter((row) =>
      row.printedRef.endsWith("（PS）"),
    );
    expect(ps).toHaveLength(4);
    // Same numbers as booster cards, different cards: 書き下ろし art, NOT FOR SALE.
    expect(ps.map((row) => narutoDiskCardId(row.printedRef))).toEqual([
      "ni0001-ps",
      "ni0002-ps",
      "ni0003-ps",
      "ni0011-ps",
    ]);
    expect(narutoDiskCardId("忍-1")).toBe("ni0001");
    expect(ps.every((row) => row.bandaiYear === 2003)).toBe(true);
    // One listing, one photo each — the lot shows every card separately.
    expect(new Set(ps.map((row) => row.listing)).size).toBe(1);
    expect(new Set(ps.map((row) => row.curated)).size).toBe(4);
  });

  it("keeps one 忍-20 photo and says why the others lost", () => {
    const twenty = mercariLedger().faces.filter(
      (row) => row.printedRef === "忍-20",
    );
    // Same card, three photos: only the straight-on unsleeved one is a face.
    expect(twenty.filter((row) => row.ingest === true)).toHaveLength(1);
    expect(twenty.filter((row) => row.ingest === false)).toHaveLength(2);
    expect(
      twenty.every((row) =>
        row.ingest === false ? Boolean(row.reason) : true,
      ),
    ).toBe(true);
    expect(narutoDiskCardId("忍-20")).toBe("ni0020");
  });
});
