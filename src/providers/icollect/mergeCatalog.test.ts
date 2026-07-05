import { describe, expect, it } from "vitest";

import { mergeICollectCatalogMetadata } from "./mergeCatalog";
import type { ICollectMetadata } from "./types";

const base: ICollectMetadata = {
  itemId: "892033",
  itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
  title: "Mario Kart Wii",
  platform: "Nintendo Wii",
  publisher: "Nintendo",
  coverUrl: "https://example.com/cover.jpg",
  images: [{ url: "https://example.com/cover.jpg", label: "Main" }],
  genres: ["Racing"],
  catalogSource: "page",
};

describe("mergeICollectCatalogMetadata", () => {
  it("keeps existing fields when the incoming page fetch is partial", () => {
    const merged = mergeICollectCatalogMetadata(base, {
      ...base,
      platform: null,
      publisher: null,
      images: [],
      genres: undefined,
      estimatedValueCents: 1999,
      catalogSource: "page",
    });

    expect(merged.platform).toBe("Nintendo Wii");
    expect(merged.publisher).toBe("Nintendo");
    expect(merged.images).toEqual(base.images);
    expect(merged.genres).toEqual(["Racing"]);
    expect(merged.estimatedValueCents).toBe(1999);
    expect(merged.catalogSource).toBe("page");
  });

  it("unions images and genres from both rows", () => {
    const merged = mergeICollectCatalogMetadata(base, {
      ...base,
      images: [{ url: "https://example.com/back.jpg", label: "Back" }],
      genres: ["Multiplayer"],
      catalogSource: "page",
    });

    expect(merged.images).toEqual([
      { url: "https://example.com/cover.jpg", label: "Main" },
      { url: "https://example.com/back.jpg", label: "Back" },
    ]);
    expect(merged.genres).toEqual(["Racing", "Multiplayer"]);
  });

  it("keeps sitemap source when both rows are sitemap-only", () => {
    const sitemapRow: ICollectMetadata = {
      ...base,
      platform: null,
      catalogSource: "sitemap",
    };
    const merged = mergeICollectCatalogMetadata(sitemapRow, {
      ...sitemapRow,
      images: [{ url: "https://example.com/extra.jpg" }],
      catalogSource: "sitemap",
    });

    expect(merged.catalogSource).toBe("sitemap");
    expect(merged.images).toHaveLength(2);
  });
});
