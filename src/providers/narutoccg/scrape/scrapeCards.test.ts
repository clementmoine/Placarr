import { describe, expect, it } from "vitest";

import { cdxSweepFromHitsLog, recoverCdxSweep } from "./scrapeCards";

describe("recoverCdxSweep", () => {
  it("throws when the caller asked for a live CDX only", () => {
    expect(() =>
      recoverCdxSweep({
        error: new Error("CDX HTTP 503"),
        cached: {
          cards: [],
          site: [],
          cdxRows: 12,
          imageRows: 12,
          source: "cache",
        },
        requireLive: true,
      }),
    ).toThrow("CDX HTTP 503");
  });

  it("reuses the last Wayback index so extract can still rebuild from disk", () => {
    const cached = cdxSweepFromHitsLog({
      cdxRows: 2,
      imageRows: 2,
      cards: [
        {
          printKey: "naruto:s1-ni001",
          original:
            "http://www.carddass.fr/naruto/images/cartes/1/NINJA-001.jpg",
          timestamp: "20080101120000",
          role: "art",
        },
      ],
      site: [
        {
          relPath: "images/packshots/s1.jpg",
          original: "http://www.carddass.fr/naruto/images/packshots/s1.jpg",
          timestamp: "20080101120000",
          kind: "packshot",
        },
      ],
    });
    expect(cached?.cards).toHaveLength(1);
    expect(cached?.cards[0]?.parsed.number).toBe("ni001");
    const recovered = recoverCdxSweep({
      error: new Error("CDX HTTP 503"),
      cached,
      requireLive: false,
    });
    expect(recovered.source).toBe("cache");
    expect(recovered.cards).toHaveLength(1);
    expect(recovered.site).toHaveLength(1);
  });

  it("skips Wayback downloads when nothing is cached, without failing extract", () => {
    const recovered = recoverCdxSweep({
      error: new Error("CDX HTTP 503"),
      cached: null,
      requireLive: false,
    });
    expect(recovered.source).toBe("unavailable");
    expect(recovered.cards).toEqual([]);
    expect(recovered.site).toEqual([]);
  });
});
