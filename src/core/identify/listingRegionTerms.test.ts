import { describe, expect, it } from "vitest";

import { LISTING_REGION_TERMS } from "@/core/identify/listingTerms";
import {
  LOCALE_REGION_ORDER,
  LOCALE_REGION_ORDER_EN,
  USER_VISIBLE_REGIONS,
} from "@/core/locale/preference";
import { cleanTitleForDisplay } from "@/core/identify/titleUtils";

/**
 * `LISTING_REGION_TERMS` is a *noise* vocabulary: every term in it is stripped
 * out of marketplace titles. It looks like a list of language codes, which
 * invites "completing" it from an ISO dataset — that would be a regression, not
 * an improvement, because most two-letter ISO codes are also ordinary words.
 * These tests pin both halves of that reasoning.
 */
describe("LISTING_REGION_TERMS", () => {
  it("stays a closed list of listing chrome, not a language dataset", () => {
    // Broadcast standards and seller shorthand — none of them are ISO codes.
    for (const term of ["pal", "ntsc", "secam", "vf", "version", "import"]) {
      expect(LISTING_REGION_TERMS).toContain(term);
    }
    // Small enough to read in one screen. Growth is the smell.
    expect(LISTING_REGION_TERMS.length).toBeLessThan(45);
  });

  it("does not swallow a real title that ends in an ISO code", () => {
    // Region terms are stripped as a *trailing* suffix. "be" (Belarusian),
    // "it" (Italian), "no" (Norwegian) and "is" (Icelandic) are all ISO 639-1
    // codes, so completing this list from an ISO dataset turns the Beatles
    // album "Let It Be" into "Let". Verified: adding those four codes to
    // LISTING_REGION_TERMS makes this assertion fail.
    expect(cleanTitleForDisplay("Let It Be")).toBe("Let It Be");
  });

  it("still strips the region chrome it is there for", () => {
    expect(cleanTitleForDisplay("Mario Kart Wii PAL")).toBe("Mario Kart");
    expect(cleanTitleForDisplay("Tekken 3 FR")).toBe("Tekken 3");
  });
});

describe("display region taxonomy", () => {
  it("keeps the English order a permutation of the same regions", () => {
    expect([...LOCALE_REGION_ORDER_EN].sort()).toEqual(
      [...LOCALE_REGION_ORDER].sort(),
    );
  });

  it("derives the user-visible subset from the taxonomy", () => {
    for (const region of USER_VISIBLE_REGIONS) {
      expect(LOCALE_REGION_ORDER).toContain(region);
    }
    // `wor` and `eu` have no ISO country equivalent — this is a console-region
    // taxonomy, so it cannot be replaced by `i18n-iso-countries`.
    expect(LOCALE_REGION_ORDER).toContain("wor");
    expect(LOCALE_REGION_ORDER).toContain("eu");
  });
});
