import { describe, expect, it } from "vitest";

import {
  mercariItemIdFromListing,
  mercariOrigPhotoUrl,
} from "./mercariCdn";

describe("mercariCdn", () => {
  it("derives orig photo URLs from listing links", () => {
    expect(mercariItemIdFromListing("https://jp.mercari.com/item/m53370794755")).toBe(
      "m53370794755",
    );
    expect(mercariOrigPhotoUrl("https://jp.mercari.com/item/m53370794755")).toBe(
      "https://static.mercdn.net/item/detail/orig/photos/m53370794755_1.jpg",
    );
    expect(mercariOrigPhotoUrl("m28811788058", 3)).toBe(
      "https://static.mercdn.net/item/detail/orig/photos/m28811788058_3.jpg",
    );
  });
});
