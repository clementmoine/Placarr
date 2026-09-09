import { describe, expect, it } from "vitest";

import { narutoDiskCardId } from "../collectorIdentity";
import { yahooAuctionLedger, yahooIngestFaces } from "./yahooAuctions";

describe("yahoo auction faces", () => {
  it("does not crawl live search", () => {
    expect(yahooAuctionLedger().crawlLive).toBe(false);
    expect(yahooAuctionLedger().ingest).toBe("curated-faces");
  });

  it("ingests attested 巻ノ壱 + OP/PR photos, not 忍-3 stand-ins", () => {
    expect(yahooIngestFaces().map((row) => row.printedRef)).toEqual([
      "忍-19",
      "忍-20",
      "術-14",
      "術-17",
      "作-5",
      "作-8",
      "作-14",
      "作-18",
      "作-21",
      "OP忍-3",
      "PR忍-3",
    ]);
    expect(
      yahooIngestFaces().every((row) => row.curated.endsWith("source.jpg")),
    ).toBe(true);
    expect(
      yahooIngestFaces().map((row) => narutoDiskCardId(row.printedRef)),
    ).toEqual([
      "ni0019",
      "ni0020",
      "te0014",
      "te0017",
      "ta0005",
      "ta0008",
      "ta0014",
      "ta0018",
      "ta0021",
      "opni0003",
      "prni0003",
    ]);
    expect(
      yahooAuctionLedger().faces.some(
        (row) => row.printedRef === "忍-3" && row.ingest === false,
      ),
    ).toBe(true);
    expect(yahooIngestFaces().some((row) => row.printedRef === "忍-3")).toBe(
      false,
    );
  });
});
