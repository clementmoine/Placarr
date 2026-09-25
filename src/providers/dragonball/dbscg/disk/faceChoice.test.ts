import { describe, expect, it } from "vitest";

import {
  dbsFaceFileOf,
  dbsFaceFilename,
  dbsFaceSourceOf,
  parseFaceDecision,
  pickBestFace,
} from "./faceChoice";

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

describe("the extension belongs to the source, not the convention", () => {
  it("names a file with whatever format arrived", () => {
    /*
      `.webp` used to be baked into the name, so Bandai's PNG was re-encoded at
      `quality: 92` — lossy, and permanent — purely to satisfy a filename. A
      catalogue that ranks faces on quality must not degrade them on the way in.
    */
    expect(dbsFaceFilename("bandai", "art", "png")).toBe("art.bandai.png");
    expect(dbsFaceFilename("dbscards", "back", "jpg")).toBe(
      "back.dbscards.jpg",
    );
    expect(dbsFaceFilename("dbscards")).toBe("art.dbscards.webp");
  });

  it("reads a face back whatever its format", () => {
    expect(dbsFaceFileOf("art.bandai.png")).toEqual({
      role: "art",
      source: "bandai",
      ext: "png",
    });
    expect(dbsFaceSourceOf("art.deckplanet.jpeg")).toBe("deckplanet");
  });

  it("still refuses a name that is not a face", () => {
    // The legacy `art.webp` has no source segment and must stay unreachable.
    expect(dbsFaceFileOf("art.webp")).toBeNull();
    expect(dbsFaceFileOf("art.unknownsource.webp")).toBeNull();
  });

  it("records the file that exists rather than a rebuilt name", () => {
    // A decision naming `art.bandai.webp` when disk holds `.png` points at
    // nothing, and the card falls back to a remote URL for no reason.
    expect(parseFaceDecision('{"art":"art.bandai.png"}', "art")).toBe(
      "art.bandai.png",
    );
  });
});
