import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { listCatalogueCards, resetCatalogueCardsCache } from "@/lib/admin/catalogueCards";

import {
  clearDbsCgCatalogueBrowseCache,
  listDbsCgCatalogueBrowsePageRows,
} from "./catalogueBrowse";
import { dbsCgDbPath } from "./indexStore";

const hasDb = existsSync(dbsCgDbPath());

describe.skipIf(!hasDb)("dbs cg catalogue browse local faces", () => {
  it("resolves densified disk art even when sqlite holds a CDN URL", () => {
    clearDbsCgCatalogueBrowseCache();
    const page = listDbsCgCatalogueBrowsePageRows({
      langs: ["fr"],
      offset: 0,
      limit: 96,
    });
    const withArt = page.rows.filter((row) => row.artUrl && !row.missingArt);
    expect(withArt.length).toBeGreaterThan(0);
    expect(withArt.every((row) => row.artUrl.startsWith("/assets/"))).toBe(
      true,
    );
    expect(
      withArt.every((row) => !/^https?:\/\//i.test(row.artUrl)),
    ).toBe(true);
  });

  it("missingArtOnly ignores SAMPLE HTTPS once disk faces resolve", async () => {
    clearDbsCgCatalogueBrowseCache();
    resetCatalogueCardsCache();
    const { listDbsCgCatalogueBrowsePage } = await import("./indexStore");
    const sqlCandidates = listDbsCgCatalogueBrowsePage({
      langs: ["fr"],
      missingArtOnly: true,
      offset: 0,
      limit: 1,
    });
    // HTTPS leftovers count as missing at SQL — densify debt candidate set.
    expect(sqlCandidates.total).toBeGreaterThan(1_000);

    const page = await listCatalogueCards({
      pack: "dragonball/cg",
      preferLang: "fr",
      locales: "preferred",
      missingArtOnly: true,
      limit: 24,
    });
    const faces = page.cards.filter((row) => row.kind === "face");
    expect(faces.every((row) => row.missingArt && row.artUrl === "")).toBe(
      true,
    );
    // After disk hydrate, densified SAMPLE rows drop out — not the full CDN set.
    expect(page.total).toBeLessThan(sqlCandidates.total);
    expect(page.total).toBeLessThan(500);
  }, 60_000);
});
