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
import { DBS_FW_FACE_LANGS, fwListedUrl } from "./fetchFaces";
import {
  DBS_FW_CARDLIST_LOCALES,
  DBS_FW_DEFAULT_LOCALES,
} from "./parseCardlist";

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
  it("files the Japanese printing under one locale, whatever names it", () => {
    /*
      Bandai publishes the same printing four times — `/fw/jp/` names it 孫悟天,
      `/fw/asia-en/` "Son Goten" — and dbscards lists it as `ja`. One printing,
      one folder, so nothing has to be translated between sources.
    */
    expect([...DBS_FW_FACE_LANGS]).toEqual(["en", "ja"]);
    for (const loc of ["asia-en", "jp", "asia-tc", "asia-th"] as const) {
      expect(DBS_FW_CARDLIST_LOCALES[loc].lang).toBe("ja");
    }
    expect(DBS_FW_CARDLIST_LOCALES.en.lang).toBe("en");
  });

  it("defaults to the catalogue written in Roman script", () => {
    expect([...DBS_FW_DEFAULT_LOCALES]).toEqual(["en", "asia-en"]);
  });
});
