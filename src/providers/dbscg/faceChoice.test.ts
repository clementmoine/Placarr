import { describe, expect, it } from "vitest";

import { dbsFaceFilename, dbsFaceSourceOf, pickBestFace } from "./faceChoice";

describe("dbsFaceSourceOf", () => {
  it("round-trips a stored filename", () => {
    expect(dbsFaceSourceOf(dbsFaceFilename("dbscards"))).toBe("dbscards");
  });

  it("ignores the chosen copy and anything foreign", () => {
    // `art.webp` is the winner's copy, not a source in its own right —
    // counting it would let a stale choice re-enter the ranking.
    expect(dbsFaceSourceOf("art.webp")).toBeNull();
    expect(dbsFaceSourceOf("art.tcgplayer.webp")).toBeNull();
    expect(dbsFaceSourceOf("thumb.jpg")).toBeNull();
  });
});

describe("pickBestFace", () => {
  it("grades by quality tier, so close sizes tie rather than split hairs", () => {
    /*
      The scorer buckets resolution: 260x363 and anything smaller share a tier.
      Worth pinning, because it is what makes the locale list matter — ties are
      common, not exceptional.
    */
    expect(
      pickBestFace(
        [
          { source: "bandai", width: 260, height: 363 },
          { source: "deckplanet", width: 260, height: 364 },
        ],
        "en",
      ),
    ).toBe("deckplanet");
  });

  it("takes the most pixels, whatever the source", () => {
    // Deckplanet beats dbscards on the recent English sets; a fixed source
    // order would have thrown those 860x1205 away.
    expect(
      pickBestFace([
        { source: "dbscards", width: 400, height: 560 },
        { source: "deckplanet", width: 860, height: 1205 },
      ]),
    ).toBe("deckplanet");
  });

  it("settles a tie on the locale's own order", () => {
    const tie = [
      { source: "bandai" as const, width: 400, height: 560 },
      { source: "deckplanet" as const, width: 400, height: 560 },
    ];
    // Deckplanet is an English source and must not win a French tie.
    expect(pickBestFace(tie, "fr")).toBe("bandai");
    expect(pickBestFace(tie, "en")).toBe("deckplanet");
  });

  it("keeps size above the priority list", () => {
    /*
      Measured: Deckplanet is 260x363 on the older English sets and 860x1205
      on the recent ones, while dbscards is a steady 400x560. A list that
      overrode size would lose the old sets — so it only breaks ties.
    */
    expect(
      pickBestFace(
        [
          { source: "deckplanet", width: 260, height: 363 },
          { source: "dbscards", width: 400, height: 560 },
        ],
        "en",
      ),
    ).toBe("dbscards");
  });

  it("has no answer when it holds nothing", () => {
    expect(pickBestFace([])).toBeNull();
  });

  it("keeps an unmeasurable file rather than leaving the card blank", () => {
    expect(
      pickBestFace([
        { source: "bandai", width: 0, height: 0 },
        { source: "dbscards", width: 0, height: 0 },
      ]),
    ).toBe("dbscards");
  });

  it("prefers a measured face over an unmeasurable one", () => {
    expect(
      pickBestFace([
        { source: "dbscards", width: 0, height: 0 },
        { source: "bandai", width: 260, height: 363 },
      ]),
    ).toBe("bandai");
  });
});
