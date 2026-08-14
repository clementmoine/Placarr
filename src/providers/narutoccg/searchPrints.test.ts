import { describe, expect, it } from "vitest";

import { NARUTO_CCG_FINISHES, narutoCcgEffectPack } from "@/effects/narutoccg";

import { formatNarutoReference, lookupNarutoPrint } from "./searchPrints";

describe("formatNarutoReference", () => {
  it("prints the number the way a collector reads it off the card", () => {
    expect(formatNarutoReference("s5", "ni232")).toBe("S5 · NI-232");
    expect(formatNarutoReference("promo", "te030")).toBe("PROMO · TE-030");
  });

  it("keeps a variant suffix rather than dropping it", () => {
    // `te030-cdf` is a distinct print, not a stray suffix to normalise away.
    expect(formatNarutoReference("promo", "te030-cdf")).toBe(
      "PROMO · TE-030-cdf",
    );
  });

  it("passes through a number it cannot parse instead of mangling it", () => {
    expect(formatNarutoReference("s1", "weird")).toBe("S1 · weird");
  });
});

/**
 * Two finishes, on every card. Deriving them from the catalogue rarity denied
 * a collector a copy they physically own (`ta158` is filed `commune` and
 * exists in holo), so rarity stays a fact and never gates the choice.
 */
describe("finishes", () => {
  const finishes = (printKey: string) => lookupNarutoPrint(printKey)?.finishes;

  it("offers plain and holo whatever the catalogue rarity says", () => {
    // holo, commune, and the card that proved the rarity untrustworthy.
    for (const key of [
      "naruto:s1-ni001",
      "naruto:s1-cl001",
      "naruto:s4-ta158",
    ]) {
      expect(finishes(key)).toEqual(["normal", "holo"]);
    }
  });

  it("does not turn a promo into a finish — that is how it was handed out", () => {
    const promo = lookupNarutoPrint("naruto:promo-ni023");
    expect(promo?.rarity).toBe("promo");
    expect(promo?.finishes).toEqual(["normal", "holo"]);
  });

  it("marks the plain finish so the renderer lays no foil over it", () => {
    const candidate = lookupNarutoPrint("naruto:s1-ni001");
    expect(candidate?.plainFinishes).toEqual(["normal"]);
    // Always a subset: a finish the picker offers but the renderer cannot
    // classify would silently render as plain.
    for (const plain of candidate?.plainFinishes ?? []) {
      expect(candidate?.finishes).toContain(plain);
    }
  });

  it("carries the foil mask, without which every surface renders it flat", () => {
    // The picker, the tile and the detail page all gate on the candidate
    // having one — the pack fallback is never reached.
    expect(lookupNarutoPrint("naruto:s1-ni001")?.foilMaskUrl).toBe(
      "/assets/naruto/ccg/full_foil_mask.webp",
    );
  });

  it("routes every shiny finish to a shader, so none renders flat", () => {
    for (const finish of NARUTO_CCG_FINISHES) {
      expect(
        narutoCcgEffectPack.resolveCss(finish, null).finishShaderId,
      ).toBeTruthy();
    }
  });
});
