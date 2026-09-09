import { describe, expect, it } from "vitest";

import { pokemonFaceFileFromTex } from "./packAssetUrls";

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
