import { describe, expect, it } from "vitest";

import { metadataCandidatesForType } from "./selection";

describe("metadataCandidatesForType(hardware)", () => {
  it("includes catalog + collector anchors for console shelves", () => {
    const ids = metadataCandidatesForType("hardware").map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "pricecharting",
        "icollect",
        "fullset",
        "achatmoinscher",
        "ebay",
      ]),
    );
    // Game-only databases stay off the hardware pool.
    expect(ids).not.toContain("screenscraper");
    expect(ids).not.toContain("igdb");
  });
});
