import { describe, expect, it } from "vitest";

import {
  slabzFaceLedger,
  slabzFaceUrl,
  slabzIngestFaces,
} from "./slabzFaces";

describe("slabz faces ledger", () => {
  it("keeps five pasted media ids recoverable via Wix CDN — no blog crawl", () => {
    const ledger = slabzFaceLedger();
    expect(ledger.faces.ingest).toBe("art.slabz.jpg");
    expect(ledger.faces.note).toMatch(/pas de crawl|collées/i);
    const faces = slabzIngestFaces();
    expect(faces).toHaveLength(5);
    expect(faces.map((f) => f.disk)).toEqual([
      "ni0001",
      "ni0002",
      "ni0003",
      "ni0011",
      "prni0001",
    ]);
    for (const row of faces) {
      expect(row.media).toMatch(/^2bc309_[a-f0-9]{32}$/);
      expect(slabzFaceUrl(row.media)).toBe(
        `https://static.wixstatic.com/media/${row.media}~mv2.jpg`,
      );
    }
  });
});
