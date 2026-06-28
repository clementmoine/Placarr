import { describe, expect, it, vi } from "vitest";

import { createShopifyResolver } from "./resolver";
import type { ShopifyRetailerConfig } from "./types";

vi.mock("./fetch", () => ({
  searchShopifyProduct: vi.fn(),
  searchShopifyHits: vi.fn(),
}));

import { searchShopifyHits, searchShopifyProduct } from "./fetch";

const CONFIG: ShopifyRetailerConfig = {
  id: "latelierdesjeux",
  label: "L'Atelier des Jeux",
  baseUrl: "https://www.latelierdesjeux.com",
  types: ["boardgames"],
};

describe("createShopifyResolver", () => {
  it("iterates lookup queries and accepts only catalog candidates", async () => {
    vi.mocked(searchShopifyHits)
      .mockResolvedValueOnce([
        {
          title: "Totally Unrelated Game",
          productUrl: "https://example.com/products/unrelated",
          galleryImages: [],
          source: CONFIG.id,
        },
      ])
      .mockResolvedValueOnce([
        {
          title: "Mille Sabords",
          productUrl: "https://example.com/products/mille-sabords",
          galleryImages: [],
          source: CONFIG.id,
        },
      ]);

    const resolve = createShopifyResolver(CONFIG);
    const result = await resolve({
      name: "Mille Sabords",
      lookupQueries: ["Mille Sabords bruit", "Mille Sabords"],
    });

    expect(result?.title).toBe("Mille Sabords");
    expect(searchShopifyHits).toHaveBeenCalledTimes(2);
  });

  it("requires barcode confirmation on the barcode path", async () => {
    vi.mocked(searchShopifyProduct).mockResolvedValue({
      title: "Wrong Product",
      barcode: "1111111111111",
      productUrl: "https://example.com/products/wrong",
      galleryImages: [],
      source: CONFIG.id,
    });

    const resolve = createShopifyResolver(CONFIG);
    const result = await resolve({
      name: "Mille Sabords",
      barcode: "3421272109517",
    });

    expect(result).toBeNull();
  });
});
