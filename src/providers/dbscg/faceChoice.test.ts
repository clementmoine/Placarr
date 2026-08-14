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

  it("settles a tie on source order", () => {
    expect(
      pickBestFace([
        { source: "bandai", width: 400, height: 560 },
        { source: "dbscards", width: 400, height: 560 },
      ]),
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
