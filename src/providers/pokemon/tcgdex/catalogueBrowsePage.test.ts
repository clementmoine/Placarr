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

  it("incompleteOnly stays on SQL page (no materialize)", async () => {
    const incomplete = listPokemonCatalogueBrowsePage({
      langs: ["fr"],
      incompleteOnly: true,
      offset: 0,
      limit: 24,
    });
    expect(
      incomplete.rows.every((row) => row.missingArt || !row.name?.trim()),
    ).toBe(true);

    const viaRouter = await listCatalogueCards({
      pack: "pokemon",
      preferLang: "fr",
      incompleteOnly: true,
      offset: 0,
      limit: 24,
    });
    expect(viaRouter.total).toBe(incomplete.total);
    expect(viaRouter.cards.filter((row) => row.kind === "face").length).toBe(
      Math.min(24, incomplete.total),
    );
  });

  it("hasFoil from Live + foilOnly overscan (no materialize)", async () => {
    const bw = listPokemonCatalogueBrowsePage({
      langs: ["fr"],
      q: "bw1-",
      offset: 0,
      limit: 24,
    });
    expect(bw.rows.length).toBeGreaterThan(0);
    expect(bw.rows.some((row) => row.hasFoil)).toBe(true);

    const foil = listPokemonCatalogueBrowsePage({
      langs: ["fr"],
      q: "bw1-",
      foilOnly: true,
      offset: 0,
      limit: 12,
    });
    expect(foil.rows.length).toBeGreaterThan(0);
    expect(foil.rows.every((row) => row.hasFoil)).toBe(true);

    const viaRouter = await listCatalogueCards({
      pack: "pokemon",
      preferLang: "fr",
      q: "bw1-",
      foilOnly: true,
      offset: 0,
      limit: 12,
    });
    expect(
      viaRouter.cards
        .filter((row) => row.kind === "face")
        .every((row) => row.hasFoil),
    ).toBe(true);
  });

  it("missingArtOnly excludes disk art not indexed in a.art", () => {
    /*
      SQL `a.art` empty for cel25-25 but on-disk harvest still resolves under
      `/assets/pokemon/cards/…` (formerly pokecardex paths).
    */
    const keyed = listPokemonCatalogueBrowsePage({
      langs: ["fr"],
      q: "cel25-25",
      offset: 0,
      limit: 24,
    });
    const withDisk = keyed.rows.filter((row) =>
      row.artUrl.includes("/assets/pokemon/cards/"),
    );
    expect(withDisk.length).toBeGreaterThan(0);
    expect(withDisk.every((row) => !row.missingArt)).toBe(true);

    const missing = listPokemonCatalogueBrowsePage({
      langs: ["fr"],
      missingArtOnly: true,
      offset: 0,
      limit: 200,
    });
    const leaked = missing.rows.filter((row) =>
      withDisk.some((hit) => hit.printKey === row.printKey),
    );
    expect(leaked, leaked.map((row) => row.printKey).join(",")).toEqual([]);
    expect(missing.rows.every((row) => row.missingArt && !row.artUrl)).toBe(
      true,
    );
  });

  it("missingArtOnly total is not capped by the first page fill", async () => {
    const small = listPokemonCatalogueBrowsePage({
      langs: ["fr"],
      missingArtOnly: true,
      offset: 0,
      limit: 24,
    });
    const large = listPokemonCatalogueBrowsePage({
      langs: ["fr"],
      missingArtOnly: true,
      offset: 0,
      limit: 1_000,
    });
    expect(small.total).toBe(large.total);
    expect(small.total).toBeGreaterThan(24);
    expect(small.rows).toHaveLength(24);
    expect(small.rows.every((row) => row.missingArt && !row.artUrl)).toBe(true);

    const viaRouter = await listCatalogueCards({
      pack: "pokemon",
      preferLang: "fr",
      missingArtOnly: true,
      limit: 24,
    });
    expect(viaRouter.total).toBe(small.total);
  });

  it(
    "foilOnly without q skips leading NonFoil rows (not a false-empty page)",
    async () => {
      const foil = listPokemonCatalogueBrowsePage({
        langs: ["fr"],
        foilOnly: true,
        offset: 0,
        limit: 12,
      });
      expect(foil.rows.length).toBeGreaterThan(0);
      expect(foil.rows.every((row) => row.hasFoil)).toBe(true);

      const viaRouter = await listCatalogueCards({
        pack: "pokemon",
        preferLang: "fr",
        foilOnly: true,
        limit: 12,
      });
      expect(
        viaRouter.cards.filter((row) => row.kind === "face").length,
      ).toBeGreaterThan(0);
      expect(
        viaRouter.cards
          .filter((row) => row.kind === "face")
          .every((row) => row.hasFoil),
      ).toBe(true);
    },
    120_000,
  );
});
