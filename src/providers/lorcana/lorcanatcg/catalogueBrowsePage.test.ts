import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { listCatalogueCards } from "@/lib/admin/catalogueCards";
import {
  clearLorcanaCatalogueBrowseCache,
  listLorcanaCatalogueBrowsePageRows,
} from "@/providers/lorcana/lorcanatcg/catalogueBrowse";
import { lorcanaTcgDbPath } from "@/providers/lorcana/lorcanatcg/indexStore";

vi.mock("@/lib/admin/catalogueCardPrices", () => ({
  catalogueCardPriceQuoteByPrintKey: async () => new Map(),
  catalogueCardPriceCentsByPrintKey: async () => new Map(),
}));

const hasDb = existsSync(lorcanaTcgDbPath());

describe.skipIf(!hasDb)("lorcana catalogue SQL browse page", () => {
  afterEach(() => {
    clearLorcanaCatalogueBrowseCache();
    vi.restoreAllMocks();
  });

  it("pages with stable total and LIMIT size", () => {
    const first = listLorcanaCatalogueBrowsePageRows({
      langs: ["en"],
      offset: 0,
      limit: 48,
    });
    expect(first.total).toBeGreaterThan(500);
    expect(first.rows).toHaveLength(48);

    const second = listLorcanaCatalogueBrowsePageRows({
      langs: ["en"],
      offset: 48,
      limit: 48,
    });
    expect(second.total).toBe(first.total);
    expect(second.rows[0]?.printKey).not.toBe(first.rows[0]?.printKey);
  });

  it("prefers sqlite art / remote CDN before disk existsSync", async () => {
    const { resolveLorcanaCatalogueArtUrl } = await import(
      "@/providers/lorcana/lorcanatcg/catalogueBrowse"
    );
    expect(
      resolveLorcanaCatalogueArtUrl({
        printKey: "lorcana:1-1",
        lang: "en",
        art: "art.webp",
        imageUrl: "https://cdn.example/fallback.jpg",
        thumbnailUrl: null,
        fullFoilUrl: null,
      }),
    ).toMatch(/^\/assets\/lorcana\/cards\//);
    expect(
      resolveLorcanaCatalogueArtUrl({
        printKey: "lorcana:1-2",
        lang: "en",
        art: null,
        imageUrl: null,
        thumbnailUrl: null,
        fullFoilUrl: "https://cdn.example/foil.png",
      }),
    ).toBe("https://cdn.example/foil.png");
  });

  it("listCatalogueCards uses SQL page for lorcana", async () => {
    const page = await listCatalogueCards({
      pack: "lorcana",
      preferLang: "en",
      offset: 0,
      limit: 48,
    });
    expect(page.total).toBeGreaterThan(500);
    expect(page.cards.length).toBeGreaterThanOrEqual(48);
    expect(page.availableLocales).toEqual(
      expect.arrayContaining(["en", "fr"]),
    );
  });
});
