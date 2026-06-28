import { describe, expect, it } from "vitest";

import { presentItem } from "@/lib/item/present";
import { buildCatalogExternalLink } from "@/services/metadata/catalogLink";

describe("buildCatalogExternalLink", () => {
  it("builds a direct game link for PAL Wii shelves", () => {
    const link = buildCatalogExternalLink({
      mediaType: "games",
      title: "Mario Kart Wii",
      shelfName: "Nintendo Wii",
      barcode: "3307211503465",
    });
    expect(link?.isDirect).toBe(true);
    expect(link?.url).toContain("pricecharting.com/game/");
    expect(link?.url).toContain("mario-kart-wii");
    expect(link?.providerLabel).toBe("PriceCharting");
  });

  it("skips non-game media types", () => {
    expect(
      buildCatalogExternalLink({
        mediaType: "books",
        title: "1984",
        shelfName: "Livres",
      }),
    ).toBeNull();
  });
});

describe("presentItem referenceCatalogLink", () => {
  it("attaches a catalog link for game shelves", () => {
    const presented = presentItem({
      name: "Mario Kart Wii",
      barcode: "3307211503465",
      shelf: { type: "games", name: "Nintendo Wii" },
      metadata: { title: "Mario Kart Wii" },
    });
    expect(presented.referenceCatalogLink?.url).toContain("pricecharting.com");
    expect(presented.referenceCatalogLink?.providerLabel).toBe("PriceCharting");
  });
});
