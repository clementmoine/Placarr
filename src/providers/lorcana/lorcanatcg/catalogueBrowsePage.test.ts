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

  it("serves local /assets only — never CDN in the admin grid", async () => {
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
    // Remote foil / image URLs are Sync densify inputs, not catalogue tiles.
    expect(
      resolveLorcanaCatalogueArtUrl({
        printKey: "lorcana:1-2",
        lang: "en",
        art: null,
        imageUrl: null,
        thumbnailUrl: null,
        fullFoilUrl: "https://cdn.example/foil.png",
      }),
    ).not.toMatch(/^https?:\/\//i);
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

  it("incompleteOnly stays on SQL page (no full materialize)", async () => {
    const incomplete = listLorcanaCatalogueBrowsePageRows({
      langs: ["en"],
      incompleteOnly: true,
      offset: 0,
      limit: 24,
    });
    expect(
      incomplete.rows.every(
        (row) => row.missingArt || !row.name?.trim(),
      ),
    ).toBe(true);

    const viaRouter = await listCatalogueCards({
      pack: "lorcana",
      preferLang: "en",
      incompleteOnly: true,
      offset: 0,
      limit: 24,
    });
    expect(viaRouter.total).toBe(incomplete.total);
  });

  it("foilOnly stays on SQL and only returns hasFoil faces", async () => {
    const foil = listLorcanaCatalogueBrowsePageRows({
      langs: ["en"],
      foilOnly: true,
      offset: 0,
      limit: 24,
    });
    expect(foil.total).toBeGreaterThan(0);
    expect(foil.rows.every((row) => row.hasFoil)).toBe(true);

    const viaRouter = await listCatalogueCards({
      pack: "lorcana",
      preferLang: "en",
      foilOnly: true,
      offset: 0,
      limit: 24,
    });
    expect(viaRouter.total).toBe(foil.total);
    expect(
      viaRouter.cards.filter((row) => row.kind === "face").every((row) => row.hasFoil),
    ).toBe(true);
  });
});
