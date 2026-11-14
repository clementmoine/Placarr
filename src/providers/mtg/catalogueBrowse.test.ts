import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import {
  clearIdentityCatalogueBrowseCache,
  tryBuildIdentityCatalogueRows,
} from "@/lib/admin/catalogueIdentityBrowse";
import { listCatalogueCards, resetCatalogueCardsCache } from "@/lib/admin/catalogueCards";
import { clearLocalPrintsIndexSingletons } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  clearMtgCatalogueBrowseCache,
  listMtgCatalogueBrowsePage,
} from "./catalogueBrowse";

const hasMtg = existsSync("data/mtg/catalog.sqlite");
const hasArtUrls = existsSync("data/mtg/curated/art-urls.json");

describe.skipIf(!hasMtg)("MTG catalogue browse (local + Scryfall soft-fill)", () => {
  afterEach(() => {
    clearIdentityCatalogueBrowseCache();
    clearMtgCatalogueBrowseCache();
    clearLocalPrintsIndexSingletons("mtg");
    resetCatalogueCardsCache();
  });

  it("SQL page soft-fills EN tiles from Scryfall CDN when disk face is absent", () => {
    const page = listMtgCatalogueBrowsePage({
      langs: ["en"],
      offset: 0,
      limit: 48,
    });
    expect(page.total).toBeGreaterThan(100_000);
    expect(page.rows.length).toBeGreaterThan(0);
    expect(page.rows.length).toBeLessThanOrEqual(48);
    const withFace = page.rows.filter((r) => r.artUrl.length > 0);
    expect(withFace.length).toBeGreaterThan(0);
    expect(
      withFace.every(
        (r) =>
          r.artUrl.startsWith("/assets/mtg/") ||
          r.artUrl.startsWith("https://cards.scryfall.io/"),
      ),
    ).toBe(true);
    expect(
      page.rows.every(
        (r) => !/errors\.scryfall\.com|\/soon\.jpe?g/i.test(r.artUrl),
      ),
    ).toBe(true);
    if (hasArtUrls) {
      expect(
        withFace.some((r) =>
          r.artUrl.startsWith("https://cards.scryfall.io/"),
        ),
      ).toBe(true);
    }
  });

  it("missingArtOnly pages via SQL stay empty (no CDN soft-fill)", () => {
    const page = listMtgCatalogueBrowsePage({
      langs: ["en"],
      offset: 0,
      limit: 24,
      missingArtOnly: true,
    });
    expect(page.total).toBeGreaterThan(1_000);
    expect(page.rows.length).toBeGreaterThan(0);
    expect(page.rows.every((r) => r.missingArt && r.artUrl === "")).toBe(true);
  });

  it("listCatalogueCards preferred EN stays interactive with faces", async () => {
    const page = await listCatalogueCards({
      pack: "mtg",
      preferLang: "en",
      locales: "preferred",
      limit: 48,
    });
    expect(page.total).toBeGreaterThan(50_000);
    const faces = page.cards.filter((c) => c.kind === "face");
    expect(faces.length).toBeGreaterThan(0);
    expect(faces.some((c) => c.artUrl.length > 0 && !c.missingArt)).toBe(true);
  });

  it("materialize identity rows stay local-only (offline densify audit)", () => {
    const rows = tryBuildIdentityCatalogueRows("mtg");
    expect(rows).not.toBeNull();
    expect(rows!.length).toBeGreaterThan(100_000);
    expect(
      rows!.filter((r) => r.artUrl.startsWith("https://cards.scryfall.io/")),
    ).toEqual([]);
    const missing = rows!.filter((r) => r.missingArt);
    expect(missing.length).toBeGreaterThan(1_000);
  }, 120_000);
});
