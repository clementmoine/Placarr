import { describe, expect, it } from "vitest";

import {
  kinkaiIngestBacks,
  kinkaiIngestPackshots,
  kinkaiPackshotLedger,
} from "./kinkaiPackshots";

describe("kinkai duopack packshots", () => {
  it("wires FR duopack-s28 face + verso from pasted uploads (no crawl)", () => {
    const ledger = kinkaiPackshotLedger();
    expect(ledger.ingestCollection).toBe(false);
    expect(ledger.listing).toContain("/article/5274");
    expect(kinkaiIngestPackshots().map((row) => row.staging)).toEqual([
      "staging/kinkai/duopack-s28-01.webp",
    ]);
    expect(kinkaiIngestBacks().map((row) => row.staging)).toEqual([
      "staging/kinkai/duopack-s28-02.webp",
    ]);
    const back = kinkaiIngestBacks()[0]!;
    expect(back).toMatchObject({
      slug: "duopack-s28",
      role: "back",
      ean: "3391891970488",
    });
    expect(back.note).toContain("7 + 1");
    expect(back.note).toContain("MADE IN ITALY");
  });
});
