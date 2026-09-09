import { describe, expect, it } from "vitest";

import {
  atomicempireIngestPackshots,
  atomicempirePackshotLedger,
} from "./atomicempirePackshots";

describe("Atomic Empire EN CCG packshots", () => {
  it("pastes Sage's Legacy open-box display (despite booster listing title)", () => {
    const ledger = atomicempirePackshotLedger();
    expect(ledger.ingestCollection).toBe(false);
    const [row] = atomicempireIngestPackshots();
    expect(row).toMatchObject({
      slug: "display-s24",
      setCode: "s24",
      kind: "display",
      lang: "EN",
      ingest: true,
    });
    expect(row?.listing).toContain("atomicempire.com/Item/117169");
    expect(row?.staging).toBe("staging/atomicempire/display-s24.jpg");
    expect(row?.note?.toLowerCase()).toContain("display");
  });
});
