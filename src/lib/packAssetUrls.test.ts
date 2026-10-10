import { describe, expect, it } from "vitest";

import {
  assetsPackBase,
  pokemonFaceFileFromTex,
  rewriteAssetPackUrl,
  rewriteAssetUrlForPrintKeyChange,
} from "./packAssetUrls";

describe("rewriteAssetPackUrl", () => {
  it("rewrites legacy dbs/jcc sealed URLs onto dragonball/jcc", () => {
    expect(
      rewriteAssetPackUrl(
        "/assets/dbs/jcc/products/part1-booster-1188/fr/art.dbzcollection.jpg",
      ),
    ).toBe(
      "/assets/dragonball/jcc/products/part1-booster-1188/fr/art.dbzcollection.jpg",
    );
    expect(assetsPackBase("dbs/jcc")).toBe("/assets/dragonball/jcc");
  });

  it("leaves canonical and unrelated URLs alone", () => {
    expect(
      rewriteAssetPackUrl(
        "/assets/dragonball/jcc/products/part1-booster-1188/fr/art.jpg",
      ),
    ).toBe("/assets/dragonball/jcc/products/part1-booster-1188/fr/art.jpg");
    expect(rewriteAssetPackUrl("https://cdn.example/x.jpg")).toBe(
      "https://cdn.example/x.jpg",
    );
  });
});

describe("rewriteAssetUrlForPrintKeyChange", () => {
  it("moves the card folder when an art letter is assigned", () => {
    expect(
      rewriteAssetUrlForPrintKeyChange(
        "/assets/dragonball/jcc/cards/part1/fr/d0050/art.dbzcollection.jpg",
        "dbsjcc:part1-d0050",
        "dbsjcc:part1-d0050a",
      ),
    ).toBe(
      "/assets/dragonball/jcc/cards/part1/fr/d0050a/art.dbzcollection.jpg",
    );
  });

  it("moves home set + letter for multi-set clones", () => {
    expect(
      rewriteAssetUrlForPrintKeyChange(
        "/assets/dragonball/jcc/cards/part3/fr/d0123/art.dbzcollection.jpg",
        "dbsjcc:part3-d0123",
        "dbsjcc:part2-d0123b",
      ),
    ).toBe(
      "/assets/dragonball/jcc/cards/part2/fr/d0123b/art.dbzcollection.jpg",
    );
  });
});

/**
 * Promo `bsp` sets name their foil layer `<set>_foil_<lang>_<num>` with no
 * `_wp_`. Resolved by spelling alone it fell through to `art.webp`, so 66
 * cards asked for their own artwork as a foil mask — the effect lit the whole
 * card instead of being cut out. The same bundle can also carry a stray
 * `_foil_` texture no variant claims, which must *not* become a mask: naming
 * by spelling would have overwritten 48 real masks with those.
 *
 * Mirrors `canonical_face_filename` in `unity/extract.py`, whose `as_mask`
 * carries the same decision on the writing side.
 */
describe("pokemonFaceFileFromTex — the role decides, not the spelling", () => {
  it("names a claimed foil layer as the mask", () => {
    expect(
      pokemonFaceFileFromTex("bwbsp_fr_050", "bwbsp_foil_fr_050", "mask"),
    ).toBe("mask.webp");
  });

  it("leaves an unclaimed foil texture out of the mask slot", () => {
    // `me1/it/187` declares `me1_wp_it_187` as its mask; the `_foil_` file
    // beside it belongs to no variant.
    expect(pokemonFaceFileFromTex("me1_it_187", "me1_foil_it_187")).toBe(
      "art.webp",
    );
  });

  it("still reads the `_wp_` family without being told", () => {
    expect(pokemonFaceFileFromTex("xy1_fr_001", "xy1_wp_fr_001")).toBe(
      "mask.webp",
    );
    expect(pokemonFaceFileFromTex("xy1_fr_001", "xy1_wp_ph_fr_001")).toBe(
      "mask-ph.webp",
    );
    expect(pokemonFaceFileFromTex("xy1_fr_001", "xy1_etch_fr_001")).toBe(
      "etch.webp",
    );
  });

  it("keeps the card's own stem as art whatever the role", () => {
    // A bundle whose texture matches its stem is the face, even when the
    // caller is looking for a mask.
    expect(pokemonFaceFileFromTex("xy1_fr_001", "xy1_fr_001", "mask")).toBe(
      "art.webp",
    );
  });
});
