import { describe, expect, it } from "vitest";

import { isRetailerCoverUrlAlignedWithTitle } from "./coverUrlMatch";

describe("isRetailerCoverUrlAlignedWithTitle", () => {
  it("accepts a cover filename that matches the catalog title", () => {
    expect(
      isRetailerCoverUrlAlignedWithTitle(
        "https://cdn.example.com/photoProd/zoom/outer-wilds-archaeologist-edition.jpg",
        "Outer Wilds Archaeologist Edition PS5",
      ),
    ).toBe(true);
  });

  it("rejects a cover filename for a different game", () => {
    expect(
      isRetailerCoverUrlAlignedWithTitle(
        "https://www.achatmoinscher.com/photoProd/zoom/2309/the-walking-dead-saints-and-sinners-chapter-2-retribution-payback-edit-203847518.jpg",
        "Outer Wilds Archaeologist Edition PS5 (Playstation 5)",
      ),
    ).toBe(false);
  });

  it("rejects AchatMoinsCher marketplace logo assets", () => {
    expect(
      isRetailerCoverUrlAlignedWithTitle(
        "https://www.achatmoinscher.com/img/M6.png",
        "Outer Wilds Archaeologist Edition PS5",
      ),
    ).toBe(false);
  });

  it("rejects a Sirènes cover slug for Black Stories Femmes Fatales", () => {
    expect(
      isRetailerCoverUrlAlignedWithTitle(
        "https://cdn.example.com/photoProd/zoom/sirenes-femmes-fatales.jpg",
        "Black Stories - Femmes Fatales",
      ),
    ).toBe(false);
  });

  it("keeps PriceCharting content-addressed CDN covers", () => {
    expect(
      isRetailerCoverUrlAlignedWithTitle(
        "https://storage.googleapis.com/images.pricecharting.com/6f4849d5bcf38701de45e381443bcb1276/1600.jpg",
        "Nintendo Switch OLED Édition The Legend of Zelda",
      ),
    ).toBe(true);
  });
});
