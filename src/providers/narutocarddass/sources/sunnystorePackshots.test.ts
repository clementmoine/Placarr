import { describe, expect, it } from "vitest";

import {
  sunnystoreIngestBacks,
  sunnystoreIngestPackshots,
  sunnystorePackshotLedger,
} from "./sunnystorePackshots";

describe("sunnystore sealed packshots", () => {
  it("wires FR/ES/EN sealed pastes including USA Storm 3 (no crawl)", () => {
    const ledger = sunnystorePackshotLedger();
    expect(ledger.ingestCollection).toBe(false);
    expect(ledger.listings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("ultimate-ninja-storm-3-sealed-booster"),
        expect.stringContaining("serie-series-3-jcc-castellano"),
        expect.stringContaining("bandai-sealed-booster-pack-ingles"),
        expect.stringContaining("dream-legacy-tsunade"),
        expect.stringContaining("storm-3-sealed-booster-pack-usa-version"),
      ]),
    );
    expect(sunnystoreIngestPackshots().map((row) => row.staging)).toEqual([
      "staging/sunnystore/booster-s28-01.jpg",
      "staging/sunnystore/booster-s3-es-01.jpg",
      "staging/sunnystore/booster-tp3-01.jpg",
      "staging/sunnystore/booster-s5-en-01.jpg",
      "staging/sunnystore/booster-s28-en-01.jpg",
    ]);
    expect(sunnystoreIngestBacks().map((row) => row.staging)).toEqual([
      "staging/sunnystore/booster-s28-02.jpg",
      "staging/sunnystore/booster-s3-es-02.jpg",
      "staging/sunnystore/booster-tp3-02.jpg",
      "staging/sunnystore/booster-s5-en-02.jpg",
      "staging/sunnystore/booster-s28-en-02.jpg",
    ]);
    expect(
      ledger.products.some(
        (row) =>
          row.staging === "staging/sunnystore/booster-s28-en-display.jpg" &&
          row.ingest === false,
      ),
    ).toBe(true);

    const s28en = sunnystoreIngestPackshots().find(
      (row) => row.slug === "booster-s28-en",
    )!;
    expect(s28en).toMatchObject({
      lang: "EN",
      setCode: "s28",
      cardsPerPack: 10,
      ean: "045557236489",
    });
    expect(
      sunnystoreIngestBacks().find((row) => row.slug === "booster-s28-en")!
        .note,
    ).toContain("MADE IN SINGAPORE");
  });
});
