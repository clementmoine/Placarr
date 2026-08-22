import { describe, expect, it } from "vitest";

import {
  NARUTO_PRODUCT_PRIORITY,
  narutoProductFileOf,
  narutoProductFilename,
  narutoProductLangFolder,
  pickBestNarutoProductDump,
  productSourceFromStagingRel,
} from "./productChoice";

describe("productSourceFromStagingRel", () => {
  it("maps each packshot host to a dump source", () => {
    expect(productSourceFromStagingRel("staging/trictrac/a.jpeg")).toBe(
      "trictrac",
    );
    expect(
      productSourceFromStagingRel("staging/vialudibunda/booster.jpg"),
    ).toBe("vialudibunda");
    expect(productSourceFromStagingRel("staging/ebay/booster-s2.webp")).toBe(
      "ebay",
    );
    expect(
      productSourceFromStagingRel(
        "staging/carddass-fr/images/packshots/booster_s1.gif",
      ),
    ).toBe("carddass");
    expect(productSourceFromStagingRel("staging/manga-news/images/x.jpg")).toBe(
      "manga-news",
    );
    expect(
      productSourceFromStagingRel("staging/coleka-s28/set-cover.webp"),
    ).toBe("coleka");
    expect(
      productSourceFromStagingRel("staging/coleka-s24/set-cover.webp"),
    ).toBe("coleka");
    expect(productSourceFromStagingRel("staging/goat-en-boxes/s16.gif")).toBe(
      "goat",
    );
  });
});

describe("naruto product filenames", () => {
  it("uses art.<source>.<ext> and logo.<source>.<ext>", () => {
    expect(narutoProductFilename("carddass", "art", "gif")).toBe(
      "art.carddass.gif",
    );
    expect(narutoProductFilename("carddass", "logo", "gif")).toBe(
      "logo.carddass.gif",
    );
    expect(narutoProductFileOf("logo.carddass.gif")).toEqual({
      role: "logo",
      source: "carddass",
      ext: "gif",
    });
    expect(narutoProductLangFolder("FR")).toBe("fr");
    expect(narutoProductLangFolder("JA")).toBe("ja");
  });
});

describe("pickBestNarutoProductDump", () => {
  it("falls back to locale priority when dumps have no pixels", () => {
    expect(
      pickBestNarutoProductDump(
        [
          { source: "carddass", file: "art.carddass.gif", width: 0, height: 0 },
          {
            source: "trictrac",
            file: "art.trictrac.jpeg",
            width: 0,
            height: 0,
          },
          {
            source: "vialudibunda",
            file: "art.vialudibunda.jpg",
            width: 0,
            height: 0,
          },
        ],
        "fr",
      ),
    ).toBe("trictrac");
    // `badge` est passé en tête le 2026-08-20 : c'est le seul badge de série
    // découpé, et il ne concurrence aucun packshot — il ne sert qu'au logo.
    expect(NARUTO_PRODUCT_PRIORITY.fr[0]).toBe("badge");
  });
});
