/**
 * Gros packs must page via SQL — never build*CatalogueBrowseRows on the
 * default admin browse path.
 */
import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { listCatalogueCards, resetCatalogueCardsCache } from "@/lib/admin/catalogueCards";
import { narutoPackDbPath } from "@/providers/naruto/narutocarddass/indexStore";
import { NARUTO_PACK_ID } from "@/providers/naruto/narutocarddass/identity";
import { dbsCgDbPath } from "@/providers/dragonball/dbscg/indexStore";
import { tcgdexDbPath } from "@/providers/pokemon/tcgdex/indexStore";
import { clearLocalPrintsIndexSingletons } from "@/providers/shared/cardCatalogue/localPrintsIndex";

vi.mock("@/lib/admin/catalogueCardPrices", () => ({
  catalogueCardPriceQuoteByPrintKey: async () => new Map(),
  catalogueCardPriceCentsByPrintKey: async () => new Map(),
}));

const buildCarddass = vi.hoisted(() => vi.fn());
const buildDbsCg = vi.hoisted(() => vi.fn());
const buildPokemon = vi.hoisted(() => vi.fn());
const buildMtg = vi.hoisted(() => vi.fn());

vi.mock("@/providers/naruto/narutocarddass/catalogueBrowse", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/providers/naruto/narutocarddass/catalogueBrowse")
    >();
  return {
    ...actual,
    buildCarddassCatalogueBrowseRows: (...args: unknown[]) => {
      buildCarddass(...args);
      return actual.buildCarddassCatalogueBrowseRows(
        ...(args as Parameters<typeof actual.buildCarddassCatalogueBrowseRows>),
      );
    },
  };
});

vi.mock("@/providers/dragonball/dbscg/catalogueBrowse", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/providers/dragonball/dbscg/catalogueBrowse")
    >();
  return {
    ...actual,
    buildDbsCgCatalogueBrowseRows: (...args: unknown[]) => {
      buildDbsCg(...args);
      return actual.buildDbsCgCatalogueBrowseRows(
        ...(args as Parameters<typeof actual.buildDbsCgCatalogueBrowseRows>),
      );
    },
  };
});

vi.mock("@/providers/pokemon/tcgdex/catalogueBrowse", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/providers/pokemon/tcgdex/catalogueBrowse")
    >();
  return {
    ...actual,
    buildPokemonCatalogueBrowseRows: (...args: unknown[]) => {
      buildPokemon(...args);
      return actual.buildPokemonCatalogueBrowseRows(
        ...(args as Parameters<typeof actual.buildPokemonCatalogueBrowseRows>),
      );
    },
  };
});

vi.mock("@/providers/mtg/catalogueBrowse", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/providers/mtg/catalogueBrowse")>();
  return {
    ...actual,
    buildMtgCatalogueBrowseRows: (...args: unknown[]) => {
      buildMtg(...args);
      return actual.buildMtgCatalogueBrowseRows(
        ...(args as Parameters<typeof actual.buildMtgCatalogueBrowseRows>),
      );
    },
  };
});

afterEach(() => {
  resetCatalogueCardsCache();
  clearLocalPrintsIndexSingletons("mtg");
  buildCarddass.mockClear();
  buildDbsCg.mockClear();
  buildPokemon.mockClear();
  buildMtg.mockClear();
});

describe.skipIf(!existsSync(tcgdexDbPath()))(
  "catalogue SQL page contract — pokemon",
  () => {
    it("listCatalogueCards does not call buildPokemonCatalogueBrowseRows", async () => {
      const page = await listCatalogueCards({
        pack: "pokemon",
        preferLang: "fr",
        limit: 24,
      });
      expect(page.cards.length).toBeGreaterThan(0);
      expect(buildPokemon).not.toHaveBeenCalled();
    });
  },
);

describe.skipIf(!existsSync(narutoPackDbPath(NARUTO_PACK_ID)))(
  "catalogue SQL page contract — naruto/carddass",
  () => {
    it("listCatalogueCards does not call buildCarddassCatalogueBrowseRows", async () => {
      const page = await listCatalogueCards({
        pack: "naruto/carddass",
        preferLang: "fr",
        limit: 24,
      });
      expect(page.total).toBeGreaterThan(0);
      expect(page.cards.length).toBeGreaterThan(0);
      expect(buildCarddass).not.toHaveBeenCalled();
    });

    it("exposes ja/it and serves 巻ノ under preferLang=ja (not coerced to en)", async () => {
      const page = await listCatalogueCards({
        pack: "naruto/carddass",
        preferLang: "ja",
        locales: "preferred",
        limit: 24,
      });
      expect(page.availableLocales).toEqual(
        expect.arrayContaining(["ja", "fr", "en", "it"]),
      );
      const faces = page.cards.filter((row) => row.kind === "face");
      expect(faces.length).toBeGreaterThan(0);
      expect(faces.every((row) => row.lang === "ja")).toBe(true);
      expect(
        faces.every(
          (row) =>
            /^maki/i.test(row.set) || /:maki/i.test(row.printKey),
        ),
      ).toBe(true);
      expect(buildCarddass).not.toHaveBeenCalled();
    });

    it("does not mint ghost art URLs when disk face is missing", async () => {
      const page = await listCatalogueCards({
        pack: "naruto/carddass",
        preferLang: "fr",
        locales: "preferred",
        limit: 48,
      });
      for (const row of page.cards.filter((card) => card.kind === "face")) {
        if (row.missingArt) {
          expect(row.artUrl).toBe("");
        } else {
          expect(row.artUrl.length).toBeGreaterThan(0);
          // Print-scoped resolve path (borrow-aware), not raw /cards/ lang-first.
          expect(row.artUrl).toMatch(/\/prints\//);
        }
      }
    });

    it("preferred FR applies Naruto axis (no S1 CCG N-* shells)", async () => {
      const page = await listCatalogueCards({
        pack: "naruto/carddass",
        preferLang: "fr",
        locales: "preferred",
        limit: 96,
      });
      const faces = page.cards.filter((row) => row.kind === "face");
      expect(faces.length).toBeGreaterThan(0);
      expect(faces.every((row) => row.lang === "fr")).toBe(true);
      expect(
        faces.every(
          (row) =>
            !/^n\d/i.test(row.card) ||
            /s(?:11|24|28)/i.test(row.set) ||
            /:s(?:11|24|28)-/i.test(row.printKey),
        ),
      ).toBe(true);
    });

    it("missingArtOnly uses disk hydrate (empty artUrl, missingArt)", async () => {
      const page = await listCatalogueCards({
        pack: "naruto/carddass",
        preferLang: "fr",
        locales: "preferred",
        missingArtOnly: true,
        limit: 24,
      });
      const faces = page.cards.filter((row) => row.kind === "face");
      expect(faces.every((row) => row.missingArt && row.artUrl === "")).toBe(
        true,
      );
      expect(buildCarddass).not.toHaveBeenCalled();
    });
  },
);

describe.skipIf(!existsSync(dbsCgDbPath()))(
  "catalogue SQL page contract — dragonball/cg",
  () => {
    it("listCatalogueCards does not call buildDbsCgCatalogueBrowseRows", async () => {
      const page = await listCatalogueCards({
        pack: "dragonball/cg",
        preferLang: "fr",
        limit: 24,
      });
      expect(page.total).toBeGreaterThan(0);
      expect(page.cards.length).toBeGreaterThan(0);
      expect(buildDbsCg).not.toHaveBeenCalled();
    });
  },
);

describe.skipIf(!existsSync("data/mtg/catalog.sqlite"))(
  "catalogue SQL page contract — mtg",
  () => {
    it("listCatalogueCards does not call buildMtgCatalogueBrowseRows", async () => {
      const page = await listCatalogueCards({
        pack: "mtg",
        preferLang: "en",
        locales: "preferred",
        limit: 24,
      });
      expect(page.total).toBeGreaterThan(50_000);
      expect(page.cards.length).toBeGreaterThan(0);
      expect(buildMtg).not.toHaveBeenCalled();
    });

    it("missingArtOnly stays on SQL page (no materialize)", async () => {
      const page = await listCatalogueCards({
        pack: "mtg",
        preferLang: "en",
        locales: "preferred",
        missingArtOnly: true,
        limit: 24,
      });
      expect(page.total).toBeGreaterThan(1_000);
      expect(
        page.cards
          .filter((row) => row.kind === "face")
          .every((row) => row.missingArt),
      ).toBe(true);
      expect(buildMtg).not.toHaveBeenCalled();
    });
  },
);

describe.skipIf(!existsSync(tcgdexDbPath()))(
  "catalogue SQL page contract — audit filters stay paged",
  () => {
    it("incompleteOnly does not call buildPokemonCatalogueBrowseRows", async () => {
      const page = await listCatalogueCards({
        pack: "pokemon",
        preferLang: "fr",
        incompleteOnly: true,
        limit: 24,
      });
      expect(page.total).toBeGreaterThanOrEqual(0);
      expect(buildPokemon).not.toHaveBeenCalled();
    });

    it("foilOnly stays on SQL overscan (no materialize)", async () => {
      const page = await listCatalogueCards({
        pack: "pokemon",
        preferLang: "fr",
        foilOnly: true,
        limit: 12,
      });
      expect(page.cards.filter((row) => row.kind === "face").length).toBeGreaterThan(
        0,
      );
      expect(
        page.cards
          .filter((row) => row.kind === "face")
          .every((row) => row.hasFoil),
      ).toBe(true);
      expect(buildPokemon).not.toHaveBeenCalled();
      /*
        Live foil resolve over early NonFoil sets is ~45–60s cold — keep
        headroom above the dedicated catalogueBrowsePage foilOnly suite.
      */
    }, 120_000);
  },
);
