import { describe, expect, it } from "vitest";

import { narutoDiskCardId } from "./collectorIdentity";
import {
  ebayIngestFaces,
  ebayIngestPackshots,
  ebayListingImageFull,
  ebayPackshotLedger,
} from "./ebayPackshots";

describe("eBay listing packshots", () => {
  it("keeps s-l1600 as the working large size", () => {
    expect(
      ebayListingImageFull(
        "https://i.ebayimg.com/images/g/XvQAAOSwOR5nAWTW/s-l500.webp",
      ),
    ).toBe("https://i.ebayimg.com/images/g/XvQAAOSwOR5nAWTW/s-l1600.webp");
    expect(
      ebayListingImageFull(
        "https://i.ebayimg.com/images/g/XvQAAOSwOR5nAWTW/s-l1600.webp",
      ),
    ).toBe("https://i.ebayimg.com/images/g/XvQAAOSwOR5nAWTW/s-l1600.webp");
  });

  it("upgrades booster-s2 from the pasted s-l1600, not a guessed listing", () => {
    const ledger = ebayPackshotLedger();
    expect(ebayIngestPackshots().map((row) => row.slug)).toEqual([
      "booster-s2",
    ]);
    expect(ledger.products[0]?.printedRef).toBe("05117");
    expect(ledger.products[0]?.url).toContain("/s-l1600.webp");
    expect(ledger.products[0]?.url).not.toContain("s-l2048");
    expect(ledger.ingestCollection).toBe(false);
  });

  it("keeps the hand-pasted Italian scans as faces, not packshots", () => {
    const italian = ebayIngestFaces().filter((row) => row.lang === "it");
    const byRef = new Map(italian.map((row) => [row.printedRef, row]));
    // The five pasted one by one, before the store batch.
    expect(byRef.get("NI-01")?.imageId).toBe("jw4AAOSwIQdZEbr1");
    expect(byRef.get("NI-02")?.imageId).toBe("iZoAAOSwDiBZEbxd");
    expect(byRef.get("NI-03")?.imageId).toBe("ydcAAOSwUjthy9R2");
    expect(byRef.get("NI-19")?.imageId).toBe("KGoAAOSwrhBZEb16");
    expect(byRef.get("NI-20")?.imageId).toBe("gPYAAOSwNDFf8LI9");
    expect(byRef.get("NI-01")?.staging).toBe("staging/ebay/ni0001-it.webp");
    // s-l1600 is the working large size whatever the container; eBay serves
    // webp on some listings and jpg on others (the 騎 scans are jpg).
    expect(
      ebayIngestFaces().every((row) => /\/s-l1600\.(webp|jpg)$/.test(row.url)),
    ).toBe(true);
  });

  it("joins the whole Italian batch on numbers we already mint", () => {
    const italian = ebayIngestFaces().filter((row) => row.lang === "it");
    expect(italian.length).toBeGreaterThanOrEqual(45);
    // Every ingested Italian row resolves, and no number is claimed twice.
    const ids = italian.map((row) => narutoDiskCardId(row.printedRef));
    expect(ids.every((id) => id !== null)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    // ST is the Italian tactique prefix — it files under mission, never `st`.
    const strategia = italian.find((row) => row.printedRef === "ST-69");
    expect(strategia && narutoDiskCardId(strategia.printedRef)).toBe("ta0069");
  });

  it("refuses the Italian S-numbered promos and the seller's duplicate ref", () => {
    const rejected = ebayPackshotLedger().faces.filter(
      (row) => row.ingest === false && row.lang === "it",
    );
    // NI-S12 / NI-S02 / NI-S15 / ST-S04: an Italian promo sequence we do not
    // model. Rejected rather than folded onto NI-12 and friends.
    const sNumbers = rejected.filter((row) =>
      /-S\d/.test(row.printedRef ?? ""),
    );
    expect(sNumbers).toHaveLength(4);
    expect(rejected.every((row) => Boolean(row.reason))).toBe(true);
    // Two listings claim TE-05 for two different cards; one is mislabelled.
    expect(rejected.some((row) => row.printedRef === "TE-05")).toBe(true);
  });

  it("carries the 騎 knights — a family that exists only in JP", () => {
    const knights = ebayIngestFaces().filter((row) =>
      row.printedRef.startsWith("騎-"),
    );
    expect(knights.map((row) => row.printedRef)).toEqual([
      "騎-1",
      "騎-2",
      "騎-3",
      "騎-4",
      "騎-5",
      "騎-6",
      "騎-7",
      "騎-8",
    ]);
    // The family is complete: 騎-1 … 騎-8, none missing.
    expect(knights).toHaveLength(8);
    expect(knights.map((row) => narutoDiskCardId(row.printedRef))).toEqual([
      "ki0001",
      "ki0002",
      "ki0003",
      "ki0004",
      "ki0005",
      "ki0006",
      "ki0007",
      "ki0008",
    ]);
    expect(knights.every((row) => row.lang === "ja")).toBe(true);
    // cardcheckbox attests 巻ノ十三 for 騎-7/8 only; the rest stay unplaced.
    expect(
      knights
        .filter((row) => row.setCode !== null)
        .map((row) => row.printedRef),
    ).toEqual(["騎-7", "騎-8"]);
  });

  it("keeps GAKU-001 on 忍者学校, not as a missing CCG visual", () => {
    const gaku = ebayIngestFaces().find(
      (row) => row.printedRef === "忍伝-学001",
    )!;
    expect(gaku.setCode).toBe("gaku");
    expect(gaku.listing).toBe("https://www.ebay.com/itm/388364698616");
    expect(narutoDiskCardId("GAKU-001")).toBe("gaku0001");
    expect(gaku.verso?.staging).toBe("staging/ebay/gaku0001-ja-back.webp");
    expect(gaku.verso?.note).toContain("back.ja");
  });

  it("records gametradestore as a watch, not a crawl", () => {
    const ledger = ebayPackshotLedger();
    expect(ledger.ingestCollection).toBe(false);
    expect(ledger.sellerWatch.user).toBe("primegame");
    expect(ledger.sellerWatch.store).toBe("gametradestore");
    expect(ledger.sellerWatch.url).toContain("_ssn=primegame");
    expect(ledger.note).toContain("do not crawl");
  });
});
