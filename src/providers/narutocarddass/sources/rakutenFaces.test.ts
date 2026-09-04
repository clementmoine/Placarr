import { describe, expect, it } from "vitest";

import { narutoDiskCardId } from "../collectorIdentity";
import {
  rakutenFaceLedger,
  rakutenIngestFaces,
  rakutenIngestPackshots,
} from "./rakutenPackshots";

describe("rakuten faces ledger", () => {
  it("keeps pasted CDN faces recoverable — no store crawl", () => {
    const ledger = rakutenFaceLedger();
    expect(ledger.note).toMatch(/do not crawl|paste/i);
    expect(ledger.source).toBe("rakuten");
    const faces = rakutenIngestFaces();
    expect(faces.length).toBeGreaterThan(50);
    for (const row of faces) {
      expect(row.ingest).toBe(true);
      expect(row.url).toMatch(/^https:\/\/fr\.shopping\.rakuten\.com\/pictures\//);
      expect(row.url).toMatch(/_NOPAD\.jpg$/i);
      const disk =
        String(row.diskId ?? "").trim() ||
        narutoDiskCardId(String(row.printedRef ?? ""));
      expect(disk).toBeTruthy();
      expect(String(row.lang ?? "fr").toLowerCase()).toBe("fr");
    }
  });

  it("does not treat tin-box packshots as card faces", () => {
    expect(rakutenIngestPackshots()).toEqual([]);
  });

  it("resolves TA-225 from the ledger like the pasted Angle mort scan", () => {
    const row = rakutenIngestFaces().find((f) => f.diskId === "ta0225");
    expect(row?.printedRef).toMatch(/TA-225/i);
    expect(row?.url).toContain("0199da0e-e3d3-7168-a73c-bc47848b1a8b");
  });
});
