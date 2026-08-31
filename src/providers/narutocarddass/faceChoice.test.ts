import { describe, expect, it } from "vitest";

import {
  NARUTO_FACE_PRIORITY,
  NARUTO_FACE_SOURCES,
  narutoDumpFaceRank,
  narutoFaceFilename,
  narutoFaceSourceOf,
  parseNarutoFaceDecision,
  pickBestNarutoDumpFace,
} from "./faceChoice";

describe("narutoFaceSourceOf", () => {
  it("reads art.<source>.<ext> dumps", () => {
    expect(narutoFaceSourceOf("art.suruga.jpg")).toBe("suruga");
    expect(narutoFaceSourceOf("art.nikita.png")).toBe("nikita");
    expect(narutoFaceSourceOf("art.vintage.webp")).toBe("vintage");
    expect(narutoFaceSourceOf("art.drive.webp")).toBe("drive");
    expect(narutoFaceSourceOf("art.carddass.jpg")).toBe("carddass");
    expect(narutoFaceSourceOf("art.ultrajeux.jpg")).toBe("ultrajeux");
    expect(narutoFaceSourceOf("art.ebay.webp")).toBe("ebay");
    expect(narutoFaceSourceOf("art.leboncoin.jpg")).toBe("leboncoin");
    expect(narutoFaceSourceOf("art.mercari.jpg")).toBe("mercari");
    expect(narutoFaceSourceOf("art.yahoo.jpg")).toBe("yahoo");
    expect(narutoFaceSourceOf("art.cardgameclub.jpg")).toBe("cardgameclub");
    expect(narutoFaceSourceOf("art.carddas.gif")).toBe("carddas");
    expect(narutoFaceSourceOf("art.carddas-a.png")).toBe("carddas-a");
    expect(narutoFaceSourceOf("art.carddas-b.png")).toBe("carddas-b");
    expect(narutoFaceSourceOf("art.fanset.webp")).toBe("fanset");
  });

  it("ranks variant A of an official double illustration above variant B", () => {
    expect(narutoDumpFaceRank("art.carddas-a.png", "ja")).toBeGreaterThan(
      narutoDumpFaceRank("art.carddas-b.png", "ja"),
    );
    expect(
      pickBestNarutoDumpFace(
        [
          {
            source: "carddas-a",
            file: "art.carddas-a.png",
            width: 185,
            height: 274,
          },
          {
            source: "carddas-b",
            file: "art.carddas-b.png",
            width: 185,
            height: 274,
          },
        ],
        "ja",
      ),
    ).toBe("carddas-a");
  });

  it("counts unsourced art.jpg as legacy, not a named dump", () => {
    expect(narutoFaceSourceOf("art.jpg")).toBe("legacy");
    expect(narutoFaceSourceOf("art.png")).toBe("legacy");
    expect(narutoFaceSourceOf("art.jpeg")).toBe("legacy");
  });

  it("does not treat reconstructed / corrected as dump sources", () => {
    expect(narutoFaceSourceOf("art.reconstructed.png")).toBeNull();
    expect(narutoFaceSourceOf("art.corrected.jpg")).toBeNull();
    expect(narutoFaceSourceOf("thumb.jpg")).toBeNull();
    expect(narutoFaceSourceOf("back.jpg")).toBeNull();
  });
});

describe("NARUTO_FACE_PRIORITY", () => {
  it("lists every dump source in every locale", () => {
    for (const [lang, list] of Object.entries(NARUTO_FACE_PRIORITY)) {
      expect(new Set(list), lang).toEqual(new Set(NARUTO_FACE_SOURCES));
    }
  });
});

describe("narutoDumpFaceRank", () => {
  it("prefers the locale dump on a size tie (filename order only)", () => {
    expect(narutoDumpFaceRank("art.nikita.jpg", "ja")).toBeGreaterThan(
      narutoDumpFaceRank("art.suruga.jpg", "ja"),
    );
    expect(narutoDumpFaceRank("art.vintage.jpg", "en")).toBeGreaterThan(
      narutoDumpFaceRank("art.goat.jpg", "en"),
    );
    expect(narutoDumpFaceRank("art.drive.jpg", "en")).toBeGreaterThan(
      narutoDumpFaceRank("art.vintage.jpg", "en"),
    );
    expect(narutoDumpFaceRank("art.carddass.jpg", "fr")).toBeGreaterThan(
      narutoDumpFaceRank("art.ultrajeux.jpg", "fr"),
    );
    expect(narutoDumpFaceRank("art.ultrajeux.jpg", "fr")).toBeGreaterThan(
      narutoDumpFaceRank("art.coleka.jpg", "fr"),
    );
    expect(narutoDumpFaceRank("art.coleka.jpg", "fr")).toBeGreaterThan(
      narutoDumpFaceRank("art.leboncoin.jpg", "fr"),
    );
    expect(narutoDumpFaceRank("art.leboncoin.jpg", "fr")).toBeGreaterThan(
      narutoDumpFaceRank("art.ebay.jpg", "fr"),
    );
    expect(narutoDumpFaceRank("art.coleka.jpg", "it")).toBeGreaterThan(
      narutoDumpFaceRank("art.ebay.jpg", "it"),
    );
    expect(narutoDumpFaceRank("art.ebay.jpg", "ja")).toBeGreaterThan(
      narutoDumpFaceRank("art.mercari.jpg", "ja"),
    );
    expect(narutoDumpFaceRank("art.mercari.jpg", "ja")).toBeGreaterThan(
      narutoDumpFaceRank("art.yahoo.jpg", "ja"),
    );
    expect(narutoDumpFaceRank("art.yahoo.jpg", "ja")).toBeGreaterThan(
      narutoDumpFaceRank("art.legacy.jpg", "ja"),
    );
    expect(narutoDumpFaceRank("art.legacy.jpg", "en")).toBeGreaterThan(
      narutoDumpFaceRank("art.fanset.jpg", "en"),
    );
  });
});

describe("parseNarutoFaceDecision", () => {
  it("accepts a named dump, unsourced art.jpg, and specials", () => {
    expect(
      parseNarutoFaceDecision(JSON.stringify({ art: "art.suruga.jpg" })),
    ).toBe("art.suruga.jpg");
    expect(parseNarutoFaceDecision(JSON.stringify({ art: "art.jpg" }))).toBe(
      "art.jpg",
    );
    expect(
      parseNarutoFaceDecision(JSON.stringify({ art: "art.reconstructed.png" })),
    ).toBe("art.reconstructed.png");
    expect(
      parseNarutoFaceDecision(JSON.stringify({ art: "art.corrected.jpg" })),
    ).toBe("art.corrected.jpg");
  });

  it("rejects thumbs and unknown names", () => {
    expect(
      parseNarutoFaceDecision(JSON.stringify({ art: "thumb.jpg" })),
    ).toBeNull();
    expect(parseNarutoFaceDecision("{")).toBeNull();
  });
});

describe("pickBestNarutoDumpFace", () => {
  it("picks pixels first, locale only on a tie", () => {
    expect(
      pickBestNarutoDumpFace(
        [
          { source: "nikita", file: "art.nikita.jpg", width: 200, height: 280 },
          { source: "suruga", file: "art.suruga.jpg", width: 400, height: 560 },
        ],
        "ja",
      ),
    ).toBe("suruga");
    expect(
      pickBestNarutoDumpFace(
        [
          { source: "nikita", file: "art.nikita.jpg", width: 400, height: 560 },
          { source: "suruga", file: "art.suruga.jpg", width: 400, height: 560 },
        ],
        "ja",
      ),
    ).toBe("nikita");
  });

  it("keeps the FR publisher raw over a larger Coleka photo", () => {
    expect(
      pickBestNarutoDumpFace(
        [
          {
            source: "carddass",
            file: "art.carddass.jpg",
            width: 350,
            height: 496,
          },
          {
            source: "coleka",
            file: "art.coleka.webp",
            width: 900,
            height: 1200,
          },
        ],
        "fr",
      ),
    ).toBe("carddass");
  });

  it("still uses Coleka on FR when no publisher scan is held", () => {
    expect(
      pickBestNarutoDumpFace(
        [
          {
            source: "coleka",
            file: "art.coleka.webp",
            width: 900,
            height: 1200,
          },
        ],
        "fr",
      ),
    ).toBe("coleka");
  });

  it("keeps any attested dump over a larger fanset remake", () => {
    expect(
      pickBestNarutoDumpFace(
        [
          {
            source: "vintage",
            file: "art.vintage.jpg",
            width: 80,
            height: 112,
          },
          {
            source: "fanset",
            file: "art.fanset.webp",
            width: 900,
            height: 1260,
          },
        ],
        "en",
      ),
    ).toBe("vintage");
  });

  it("uses the fanset scan when it is the only visual", () => {
    expect(
      pickBestNarutoDumpFace(
        [
          {
            source: "fanset",
            file: "art.fanset.webp",
            width: 750,
            height: 1050,
          },
        ],
        "en",
      ),
    ).toBe("fanset");
  });
});

describe("narutoFaceFilename", () => {
  it("keeps the source extension", () => {
    expect(narutoFaceFilename("suruga", "art", "jpg")).toBe("art.suruga.jpg");
    expect(narutoFaceFilename("carddas", "art", "gif")).toBe("art.carddas.gif");
  });
});
