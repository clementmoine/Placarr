import { describe, expect, it } from "vitest";

import {
  DBSCARDS_SITES,
  dbscardsListPageUrl,
} from "@/providers/shared/dbscards/list";
import { dbscardsPrintRef } from "@/providers/shared/dbscards/tile";

import {
  DBS_FW_FACE_SOURCES,
  dbsFwFaceFilename,
  pickBestFwFace,
} from "./faceChoice";
import {
  DBSCARDS_LIST_FOR,
  DBS_FW_FACE_LANGS,
  fwListedUrl,
} from "./fetchFaces";
import { dbsFwFacePool } from "./parseCardlist";

const tile = (over: Record<string, unknown> = {}) =>
  ({
    itemId: null,
    slug: "en-st01-001-l-son-goten",
    ref: "st01-001",
    sku: "ST01-001-L",
    name: "Son Goten",
    lang: "en",
    priceText: null,
    price: null,
    currency: null,
    priceDeltaText: null,
    priceDelta: null,
    imageFront: "https://static.fw.dbscards.fr/cards/en/st01/…-son-goten.webp",
    imageBack: "https://static.fw.dbscards.fr/cards/en/st01/…-son-goten-back.webp",
    ...over,
  }) as never;

describe("the Fusion World site", () => {
  it("reads its own host, not Masters'", () => {
    // Same software, different game: `fw` serves Fusion World, `www` Masters.
    expect(dbscardsListPageUrl(1, "en", DBSCARDS_SITES.fusion)).toBe(
      "https://fw.dbscards.fr/cards/liste-cartes-anglaises",
    );
    expect(dbscardsListPageUrl(3, "ja", DBSCARDS_SITES.fusion)).toBe(
      "https://fw.dbscards.fr/cards/liste-cartes-japonaises/3",
    );
  });

  it("has no French list, because the game has no French printing", () => {
    expect(() => dbscardsListPageUrl(1, "fr", DBSCARDS_SITES.fusion)).toThrow();
  });

  it("reads a Japanese slug, whose locale prefix is `jp`", () => {
    expect(
      dbscardsPrintRef({ sku: null, slug: "jp-fb09-001-l-gogeta-br" }),
    ).toBe("fb09-001");
  });
});

describe("fwListedUrl", () => {
  it("takes the side the tile names, never the filename suffix", () => {
    expect(fwListedUrl(tile(), "art")).toMatch(/son-goten\.webp$/);
    expect(fwListedUrl(tile(), "back")).toMatch(/son-goten-back\.webp$/);
  });

  it("has no back for a card that has none", () => {
    expect(fwListedUrl(tile({ imageBack: null }), "back")).toBeNull();
  });
});

describe("pickBestFwFace", () => {
  it("has only the two sources this game publishes", () => {
    // Deckplanet mirrors no Fusion World printing at all.
    expect([...DBS_FW_FACE_SOURCES]).toEqual(["dbscards", "bandai"]);
  });

  it("prefers the larger scan over Bandai's smaller one", () => {
    expect(
      pickBestFwFace(
        [
          { source: "bandai", width: 260, height: 363 },
          { source: "dbscards", width: 400, height: 560 },
        ],
        "en",
      ),
    ).toBe("dbscards");
  });

  it("still answers when nothing can be measured", () => {
    // A file we cannot measure is still a face; the card must not go blank.
    expect(
      pickBestFwFace(
        [
          { source: "bandai", width: 0, height: 0 },
          { source: "dbscards", width: 0, height: 0 },
        ],
        "ja",
      ),
    ).toBe("dbscards");
  });

  it("names files by role and source", () => {
    expect(dbsFwFaceFilename("dbscards")).toBe("art.dbscards.webp");
    expect(dbsFwFaceFilename("dbscards", "back")).toBe("back.dbscards.webp");
  });
});

describe("locale mapping", () => {
  it("files the Japanese printing where Bandai names it in Roman script", () => {
    /*
      Bandai publishes the same printing twice: `/fw/jp/` names it 孫悟天,
      `/fw/asia-en/` names it "Son Goten". dbscards calls it `ja`. One printing,
      one folder — ours is the readable one.
    */
    expect(DBSCARDS_LIST_FOR["asia-en"]).toBe("ja");
    expect(DBSCARDS_LIST_FOR["en"]).toBe("en");
    expect([...DBS_FW_FACE_LANGS]).toEqual(["en", "asia-en"]);
  });

  it("sends every locale but English to Bandai's Japanese image pool", () => {
    // Asia-EN, Traditional Chinese and Thai all print the Japanese card and
    // translate only the catalogue text — measured on ST01, one set of URLs.
    expect(dbsFwFacePool("en")).toBe("en");
    for (const l of ["asia-en", "ja", "asia-tc", "asia-th"]) {
      expect(dbsFwFacePool(l)).toBe("ja");
    }
  });
});
