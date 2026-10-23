import { describe, expect, it } from "vitest";

import {
  ebayBrowseItemId,
  parseEbayBrowseItem,
  parseEbayBrowseItemImages,
} from "./browseItem";

describe("ebayBrowseItemId", () => {
  it("builds a Browse item id with optional variation", () => {
    expect(ebayBrowseItemId("403984180609")).toBe("v1|403984180609|0");
    expect(ebayBrowseItemId("127955574207", "429137825416")).toBe(
      "v1|127955574207|429137825416",
    );
  });
});

describe("parseEbayBrowseItemImages", () => {
  it("keeps the largest i.ebayimg renditions", () => {
    expect(
      parseEbayBrowseItemImages({
        image: {
          imageUrl: "https://i.ebayimg.com/images/g/foo/s-l225.jpg",
        },
        additionalImages: [
          { imageUrl: "https://i.ebayimg.com/images/g/bar/s-l1600.webp" },
        ],
      }),
    ).toEqual([
      "https://i.ebayimg.com/images/g/foo/s-l1600.jpg",
      "https://i.ebayimg.com/images/g/bar/s-l1600.webp",
    ]);
  });
});

describe("parseEbayBrowseItem", () => {
  it("reads title and gallery from a Browse payload", () => {
    expect(
      parseEbayBrowseItem({
        itemId: "v1|403984180609|0",
        legacyItemId: "403984180609",
        title: "Naruto sell sheet",
        itemWebUrl: "https://www.ebay.com/itm/403984180609",
        image: {
          imageUrl: "https://i.ebayimg.com/images/g/front/s-l1600.jpg",
        },
      }),
    ).toMatchObject({
      legacyItemId: "403984180609",
      title: "Naruto sell sheet",
      imageUrls: ["https://i.ebayimg.com/images/g/front/s-l1600.jpg"],
    });
  });
});
