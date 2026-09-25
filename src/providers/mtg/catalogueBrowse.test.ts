import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import {
  clearIdentityCatalogueBrowseCache,
  tryBuildIdentityCatalogueRows,
} from "@/lib/admin/catalogueIdentityBrowse";

describe("MTG catalogue browse × Scryfall artUrl ledger", () => {
  afterEach(() => {
    clearIdentityCatalogueBrowseCache();
  });

  it("joins curated/art-urls.json so almost no EN/FR tile is missingArt", () => {
    if (!existsSync("data/mtg/catalog.sqlite")) return;
    if (!existsSync("data/mtg/curated/art-urls.json")) return;

    const rows = tryBuildIdentityCatalogueRows("mtg");
    expect(rows).not.toBeNull();
    expect(rows!.length).toBeGreaterThan(100_000);

    const missing = rows!.filter((r) => r.missingArt);
    const withScryfall = rows!.filter((r) =>
      r.artUrl.startsWith("https://cards.scryfall.io/"),
    );
    const withLocal = rows!.filter((r) =>
      r.artUrl.startsWith("/assets/mtg/"),
    );

    // Corpus is ~162k EN+FR titles; CDN ledger covers all current prints.
    // Ghost The List renames (CMM-40 → TCMM-40) are pruned from sqlite.
    // FR soon.jpg placeholders borrow EN via resolveMtgArtUrl.
    expect(withScryfall.length + withLocal.length).toBe(rows!.length);
    expect(missing).toEqual([]);
    expect(rows!.some((r) => r.printKey === "mtg:plst-cmm40")).toBe(false);
    expect(rows!.some((r) => r.printKey === "mtg:plst-dmc175")).toBe(false);
    expect(
      rows!.some((r) => /errors\.scryfall\.com|\/soon\.jpe?g/i.test(r.artUrl)),
    ).toBe(false);

    const sample = rows!.find((r) =>
      r.artUrl.startsWith("https://cards.scryfall.io/"),
    );
    expect(sample?.missingArt).toBe(false);
  });
});
