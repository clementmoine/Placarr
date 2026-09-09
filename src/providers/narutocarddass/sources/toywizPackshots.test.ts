import { describe, expect, it } from "vitest";

import {
  toywizIngestPackshots,
  toywizPackshotLedger,
} from "./toywizPackshots";

describe("ToyWiz EN CCG packshots", () => {
  it("pastes Sage's Legacy + Emerging Alliance + 4 collector tins; Storm 3 thumb archival", () => {
    const ledger = toywizPackshotLedger();
    expect(ledger.ingestCollection).toBe(false);
    const rows = toywizIngestPackshots();
    expect(rows.map((row) => row.slug)).toEqual([
      "booster-s24-en",
      "booster-s14",
      "tin-unbound-power-naruto",
      "tin-guardian-kakashi",
      "tin-ultimate-ninja-way-gaara",
      "tin-ultimate-battle-sasori",
    ]);
    expect(rows[0]).toMatchObject({
      setCode: "s24",
      lang: "EN",
      cardsPerPack: 10,
      packsPerDisplay: 24,
      upc: "045557236328",
      staging: "staging/toywiz/booster-s24.jpg",
    });
    expect(rows[1]).toMatchObject({
      setCode: "s14",
      lang: "EN",
      cardsPerPack: 10,
      upc: "045557235826",
      staging: "staging/toywiz/booster-s14.jpg",
    });
    expect(rows[2]).toMatchObject({
      kind: "tin",
      upc: "045557239770",
      staging: "staging/toywiz/tin-unbound-power-naruto.jpg",
    });
    expect(rows[5]).toMatchObject({
      setCode: "tin2",
      upc: "643690287353",
      staging: "staging/toywiz/tin-ultimate-battle-sasori.jpg",
    });
    const s28 = ledger.products.find((row) => row.slug === "booster-s28-en");
    expect(s28?.ingest).toBe(false);
    expect(s28?.upc).toBe("045557236489");
    expect(s28?.note).toMatch(/superseded by Sunny Store/i);
  });
});

