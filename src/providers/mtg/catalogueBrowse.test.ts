import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import {
  clearIdentityCatalogueBrowseCache,
  tryBuildIdentityCatalogueRows,
} from "@/lib/admin/catalogueIdentityBrowse";
import { listCatalogueCards, resetCatalogueCardsCache } from "@/lib/admin/catalogueCards";

import { listMtgCatalogueBrowsePage } from "./catalogueBrowse";

const hasMtg =
  existsSync("data/mtg/catalog.sqlite") &&
  existsSync("data/mtg/curated/art-urls.json");

describe("MTG catalogue browse × Scryfall artUrl ledger", () => {
  afterEach(() => {
    clearIdentityCatalogueBrowseCache();
    resetCatalogueCardsCache();
  });

  it("joins curated/art-urls.json so almost no EN/FR tile is missingArt", () => {
    if (!hasMtg) return;

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

  it.skipIf(!hasMtg)(
    "incompleteOnly is post-Scryfall (not a.art IS NULL false positives)",
    async () => {
      const page = listMtgCatalogueBrowsePage({
        langs: ["en", "fr"],
        incompleteOnly: true,
        offset: 0,
        limit: 24,
      });
      // CDN ledger covers the corpus — honest empty (or rare name gaps only).
      expect(page.total).toBeLessThan(1_000);
      expect(
        page.rows.every((row) => row.missingArt || !row.name?.trim()),
      ).toBe(true);

      const viaRouter = await listCatalogueCards({
        pack: "mtg",
        preferLang: "en",
        incompleteOnly: true,
        limit: 24,
      });
      expect(viaRouter.total).toBe(page.total);
      expect(
        viaRouter.cards
          .filter((row) => row.kind === "face")
          .every((row) => row.missingArt || !row.name?.trim()),
      ).toBe(true);
    },
  );
});
