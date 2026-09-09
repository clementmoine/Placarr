import { describe, expect, it } from "vitest";

import {
  vintedIngestBacks,
  vintedIngestPackshots,
  vintedLedger,
} from "./vintedPackshots";

describe("Vinted Fascino packshots", () => {
  it("keeps pasted CDN only — front + back ingest, spines archival, avatar rejected", () => {
    const ledger = vintedLedger();
    expect(ledger.ingestCollection).toBe(false);
    expect(ledger.listing).toContain("7633991617");
    expect(vintedIngestPackshots().map((row) => row.staging)).toEqual([
      "staging/vinted/starter-il-fascino-del-male-01.webp",
    ]);
    expect(vintedIngestBacks().map((row) => row.staging)).toEqual([
      "staging/vinted/starter-il-fascino-del-male-02.webp",
    ]);
    expect(ledger.extraAngles.map((row) => row.angle)).toEqual([
      "spine",
      "spine-opposite",
      "top-edge",
    ]);
    expect(ledger.rejected[0]?.reason).toMatch(/avatar/i);
  });
});
