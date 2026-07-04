import { describe, expect, it } from "vitest";

import {
  itemPath,
  itemMatchesVolumeItemSlug,
  itemSlugLookupVariants,
  parseVolumeItemSlug,
  shelfPath,
  slugifyItemName,
} from "./slugs";

describe("slugifyItemName", () => {
  it("drops decorative zero-padding from volume markers in slugs", () => {
    expect(slugifyItemName("Super Picsou Géant n°036")).toBe(
      "super-picsou-geant-n-36",
    );
    expect(slugifyItemName("Naruto Tome 001")).toBe("naruto-tome-1");
    expect(slugifyItemName("One Piece n°099")).toBe("one-piece-n-99");
  });

  it("leaves non-volume trailing numbers alone", () => {
    expect(slugifyItemName("James Bond 007")).toBe("james-bond-007");
  });
});

describe("itemSlugLookupVariants", () => {
  it("matches padded and unpadded volume slugs", () => {
    expect(itemSlugLookupVariants("super-picsou-geant-n-36")).toEqual(
      expect.arrayContaining([
        "super-picsou-geant-n-36",
        "super-picsou-geant-n-036",
      ]),
    );
    expect(itemSlugLookupVariants("super-picsou-geant-n-036")).toEqual(
      expect.arrayContaining([
        "super-picsou-geant-n-036",
        "super-picsou-geant-n-36",
      ]),
    );
  });
});

describe("parseVolumeItemSlug", () => {
  it("extracts series prefix and volume from canonical manga URLs", () => {
    expect(parseVolumeItemSlug("dragon-ball-z-n-1")).toEqual({
      seriesPrefix: "dragon-ball-z",
      volume: "1",
    });
  });
});

describe("itemMatchesVolumeItemSlug", () => {
  it("matches a long stored slug when the URL uses the short volume form", () => {
    expect(
      itemMatchesVolumeItemSlug("dragon-ball-z-n-1", {
        name: "Dragon Ball Z 1 . \r\n 1re partie : Les Saïyens 1",
        slug: "dragon-ball-z-1-1re-partie-les-saiyens-1",
        metadata: {
          title: "Dragon Ball Z 1 . \r\n 1re partie : Les Saïyens 1",
          aliases: JSON.stringify([
            "Dragon Ball Z - 1re partie - Tome 01: Les Saïyens - Toriyama, Akira",
          ]),
        },
      }),
    ).toBe(true);
  });
});

describe("shelfPath", () => {
  it("prefers persisted slug over computed slug from name", () => {
    expect(shelfPath({ id: "s1", name: "New Name", slug: "old-name" })).toBe(
      "/shelves/old-name",
    );
  });
});

describe("itemPath", () => {
  it("prefers persisted slug so links stay stable after title presentation", () => {
    expect(
      itemPath(
        { id: "s1", name: "Wii", slug: "wii" },
        {
          id: "i1",
          name: "Super Monkey Ball: Banana Blitz",
          slug: "super-monkey-ball-banana-blitz-complet-vf",
        },
      ),
    ).toBe("/shelves/wii/super-monkey-ball-banana-blitz-complet-vf");
  });

  it("computes unpadded volume slugs from display titles", () => {
    expect(
      itemPath(
        { id: "s1", name: "Super Picsou Géant", slug: "super-picsou-geant" },
        { id: "i1", name: "Super Picsou Géant n°036", slug: null },
      ),
    ).toBe("/shelves/super-picsou-geant/super-picsou-geant-n-36");
  });
});
