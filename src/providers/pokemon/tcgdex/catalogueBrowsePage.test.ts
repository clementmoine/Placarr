import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { listCatalogueCards } from "@/lib/admin/catalogueCards";
import {
  clearPokemonCatalogueBrowseCache,
  listPokemonCatalogueBrowsePage,
} from "@/providers/pokemon/tcgdex/catalogueBrowse";
import { tcgdexDbPath } from "@/providers/pokemon/tcgdex/indexStore";

vi.mock("@/lib/admin/catalogueCardPrices", () => ({
  catalogueCardPriceQuoteByPrintKey: async () => new Map(),
  catalogueCardPriceCentsByPrintKey: async () => new Map(),
}));

const hasDb = existsSync(tcgdexDbPath());

describe.skipIf(!hasDb)("pokemon catalogue SQL browse page", () => {
  afterEach(() => {
    clearPokemonCatalogueBrowseCache();
  });

  it("pages with stable total and LIMIT size", () => {
    const first = listPokemonCatalogueBrowsePage({
      langs: ["fr"],
      offset: 0,
      limit: 48,
    });
    expect(first.total).toBeGreaterThan(1_000);
    expect(first.rows).toHaveLength(48);

    const second = listPokemonCatalogueBrowsePage({
      langs: ["fr"],
      offset: 48,
      limit: 48,
    });
    expect(second.total).toBe(first.total);
    expect(second.rows).toHaveLength(48);
    expect(second.rows[0]?.printKey).not.toBe(first.rows[0]?.printKey);
  });

  it("filters q and missingArtOnly without full materialize", () => {
    const q = listPokemonCatalogueBrowsePage({
      langs: ["fr"],
      q: "pikachu",
      offset: 0,
      limit: 24,
    });
    expect(q.total).toBeGreaterThan(0);
    expect(q.rows.length).toBeGreaterThan(0);
    expect(
      q.rows.every(
        (row) =>
          /pikachu/i.test(row.label) ||
          /pikachu/i.test(row.name ?? "") ||
          /pikachu/i.test(row.printKey),
      ),
    ).toBe(true);

    const missing = listPokemonCatalogueBrowsePage({
      langs: ["fr"],
      missingArtOnly: true,
      offset: 0,
      limit: 24,
    });
    expect(missing.rows.every((row) => row.missingArt)).toBe(true);
  });

  it("listCatalogueCards uses SQL page for pokemon", async () => {
    const page = await listCatalogueCards({
      pack: "pokemon",
      preferLang: "fr",
      offset: 0,
      limit: 48,
    });
    expect(page.total).toBeGreaterThan(1_000);
    expect(page.cards.length).toBeGreaterThanOrEqual(48);
    expect(page.availableLocales).toEqual(
      expect.arrayContaining(["fr", "en", "ja"]),
    );

    const next = await listCatalogueCards({
      pack: "pokemon",
      preferLang: "fr",
      offset: 48,
      limit: 48,
    });
    expect(next.total).toBe(page.total);
    expect(next.cards).toHaveLength(48);
    // Page 0 may prepend pack-back tiles; face total stays SQL COUNT.
    expect(page.cards.length).toBeGreaterThanOrEqual(48);
  });
});
