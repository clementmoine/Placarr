/**
 * Boruto TBV t.6 Kana insert → sealed write shape (no live download).
 */
import { describe, expect, it } from "vitest";

import { MYTHOS_KANA_BORUTO_TBV6_SLUG } from "./kanaMangaSealed";
import {
  loadMythosPromoDistributionDig,
  resetMythosPromoDistributionCache,
  VV2_PROMO_PRINT_KEY,
} from "./sources/promoDistribution";

describe("Mythos Kana Boruto TBV t.6", () => {
  it("dig announces the manga product + ISBN for the VV2 promo", () => {
    resetMythosPromoDistributionCache();
    const dig = loadMythosPromoDistributionDig();
    expect(dig).not.toBeNull();
    expect(dig!.printKey).toBe(VV2_PROMO_PRINT_KEY);
    expect(dig!.officialAnnouncement.product).toMatch(/Boruto/i);
    expect(dig!.officialAnnouncement.product).toMatch(/Tome 6|Volume 6/i);
    expect(dig!.officialAnnouncement.isbn).toBe("9782505142133");
    expect(dig!.officialAnnouncement.coverUrl).toContain("9782505142133");
  });

  it("uses a stable sealed slug for the manga SKU", () => {
    expect(MYTHOS_KANA_BORUTO_TBV6_SLUG).toBe(
      "kana-boruto-two-blue-vortex-tome-6",
    );
  });
});
