import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import {
  clearIdentityCatalogueBrowseCache,
  tryBuildIdentityCatalogueRows,
} from "@/lib/admin/catalogueIdentityBrowse";
import { listCatalogueCards, resetCatalogueCardsCache } from "@/lib/admin/catalogueCards";

import { listMtgCatalogueBrowsePage } from "./catalogueBrowse";

const hasMtg = existsSync("data/mtg/catalog.sqlite");

describe("MTG catalogue browse (local faces only)", () => {
  afterEach(() => {
    clearIdentityCatalogueBrowseCache();
    resetCatalogueCardsCache();
  });

  it("builds EN/FR tiles from sqlite + local /assets — no Scryfall CDN in the grid", () => {
    if (!hasMtg) return;

    const rows = tryBuildIdentityCatalogueRows("mtg");
    expect(rows).not.toBeNull();
    expect(rows!.length).toBeGreaterThan(100_000);

    const withScryfall = rows!.filter((r) =>
      r.artUrl.startsWith("https://cards.scryfall.io/"),
    );
    const withLocal = rows!.filter((r) =>
      r.artUrl.startsWith("/assets/mtg/"),
    );
    const missing = rows!.filter((r) => r.missingArt);

    expect(withScryfall).toEqual([]);
    expect(withLocal.length + missing.length).toBe(rows!.length);
    expect(rows!.some((r) => r.printKey === "mtg:plst-cmm40")).toBe(false);
    expect(rows!.some((r) => r.printKey === "mtg:plst-dmc175")).toBe(false);
    expect(
      rows!.some((r) => /errors\.scryfall\.com|\/soon\.jpe?g/i.test(r.artUrl)),
    ).toBe(false);
  });

  it("marks tiles without a local /assets face as missingArt (Sync densify debt)", () => {
    if (!hasMtg) return;

    const rows = tryBuildIdentityCatalogueRows("mtg");
    expect(rows).not.toBeNull();
    const missing = rows!.filter((r) => r.missingArt);
    // Local-only grid: nearly the whole corpus is densify debt until Sync.
    expect(missing.length).toBeGreaterThan(1_000);
    expect(missing.every((r) => !r.artUrl || r.artUrl === "")).toBe(true);
  });
});
