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

vi.mock("@/lib/admin/catalogueCardPrices", () => ({
  catalogueCardPriceQuoteByPrintKey: async () => new Map(),
  catalogueCardPriceCentsByPrintKey: async () => new Map(),
}));

const buildCarddass = vi.hoisted(() => vi.fn());
const buildDbsCg = vi.hoisted(() => vi.fn());
const buildPokemon = vi.hoisted(() => vi.fn());

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

afterEach(() => {
  resetCatalogueCardsCache();
  buildCarddass.mockClear();
  buildDbsCg.mockClear();
  buildPokemon.mockClear();
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
        q: "bw1-",
        foilOnly: true,
        limit: 12,
      });
      expect(page.cards.filter((row) => row.kind === "face").length).toBeGreaterThan(
        0,
      );
      expect(buildPokemon).not.toHaveBeenCalled();
    });
  },
);
