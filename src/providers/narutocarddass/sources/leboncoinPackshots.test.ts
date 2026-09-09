import { describe, expect, it } from "vitest";

import {
  leboncoinIngestBacks,
  leboncoinIngestPackshots,
  leboncoinPackshotImageFull,
  leboncoinPackshotLedger,
} from "./leboncoinPackshots";

describe("leboncoin product packshots", () => {
  it("wires Tin Box art + verso from pasted CDN (no crawl)", () => {
    const ledger = leboncoinPackshotLedger();
    expect(ledger.ingestCollection).toBe(false);
    expect(leboncoinIngestPackshots().map((row) => row.staging)).toEqual([
      "staging/leboncoin/tin-box-01.jpg",
    ]);
    expect(leboncoinIngestBacks().map((row) => row.staging)).toEqual([
      "staging/leboncoin/pack-decouverte-03.jpg",
      "staging/leboncoin/tin-box-02.jpg",
    ]);
    const art = leboncoinIngestPackshots().find((row) => row.slug === "tin-box")!;
    expect(art).toMatchObject({
      slug: "tin-box",
      role: "art",
      printedRef: "05129",
      ean: "3296580051298",
    });
    expect(art.listing).toContain("3258840985");
    expect(leboncoinPackshotImageFull(art.url)).toContain(
      "rule=classified-1200x800-jpg",
    );
    expect(
      leboncoinIngestPackshots().some((row) => row.slug === "pack-decouverte"),
    ).toBe(false);
    expect(
      leboncoinIngestBacks().find((row) => row.slug === "pack-decouverte"),
    ).toMatchObject({
      role: "back",
      staging: "staging/leboncoin/pack-decouverte-03.jpg",
    });
  });
});
