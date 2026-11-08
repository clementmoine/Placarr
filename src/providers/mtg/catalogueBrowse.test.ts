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

describe.skipIf(!hasMtg)("MTG catalogue browse (local faces only)", () => {
  afterEach(() => {
    clearIdentityCatalogueBrowseCache();
    clearMtgCatalogueBrowseCache();
    clearLocalPrintsIndexSingletons("mtg");
    resetCatalogueCardsCache();
  });

  it("SQL page serves EN tiles without Scryfall CDN", () => {
    const page = listMtgCatalogueBrowsePage({
      langs: ["en"],
      offset: 0,
      limit: 48,
    });
    expect(page.total).toBeGreaterThan(100_000);
    expect(page.rows.length).toBeGreaterThan(0);
    expect(page.rows.length).toBeLessThanOrEqual(48);
    expect(
      page.rows.every(
        (r) =>
          !r.artUrl.startsWith("https://cards.scryfall.io/") &&
          (r.artUrl === "" || r.artUrl.startsWith("/assets/mtg/")),
      ),
    ).toBe(true);
    expect(
      page.rows.every(
        (r) => !/errors\.scryfall\.com|\/soon\.jpe?g/i.test(r.artUrl),
      ),
    ).toBe(true);
  });

  it("missingArtOnly pages via SQL (no 50k overscan hang)", () => {
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

  it("listCatalogueCards preferred EN stays interactive", async () => {
    const page = await listCatalogueCards({
      pack: "mtg",
      preferLang: "en",
      locales: "preferred",
      limit: 48,
    });
    expect(page.total).toBeGreaterThan(50_000);
    expect(page.cards.filter((c) => c.kind === "face").length).toBeGreaterThan(
      0,
    );
  });

  it("materialize identity rows stay local-only (offline audit)", () => {
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
