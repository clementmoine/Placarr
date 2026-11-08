/**
 * Cold/warm microbench for admin catalogue cards + sealed browse.
 * Skips when local sqlite / products-index are absent.
 */
import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import {
  listCatalogueCards,
  resetCatalogueCardsCache,
} from "@/lib/admin/catalogueCards";
import {
  listCatalogueProducts,
  resetCatalogueProductsCache,
} from "@/lib/admin/catalogueProducts";
import { packProductsIndexPath } from "@/lib/packPaths";
import { clearPokemonCatalogueBrowseCache } from "@/providers/pokemon/tcgdex/catalogueBrowse";
import { clearLorcanaCatalogueBrowseCache } from "@/providers/lorcana/lorcanatcg/catalogueBrowse";
import { clearCarddassCatalogueBrowseCache } from "@/providers/naruto/narutocarddass/catalogueBrowse";
import { clearDbsCgCatalogueBrowseCache } from "@/providers/dragonball/dbscg/catalogueBrowse";
import { clearMtgCatalogueBrowseCache } from "@/providers/mtg/catalogueBrowse";
import { clearLocalPrintsIndexSingletons } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { tcgdexDbPath } from "@/providers/pokemon/tcgdex/indexStore";
import { lorcanaTcgDbPath } from "@/providers/lorcana/lorcanatcg/indexStore";
import { narutoPackDbPath } from "@/providers/naruto/narutocarddass/indexStore";
import { NARUTO_PACK_ID } from "@/providers/naruto/narutocarddass/identity";
import { dbsCgDbPath } from "@/providers/dragonball/dbscg/indexStore";

async function ms(fn: () => unknown | Promise<unknown>): Promise<number> {
  const t0 = performance.now();
  await fn();
  return performance.now() - t0;
}

const hasPokemon = existsSync(tcgdexDbPath());
const hasLorcana = existsSync(lorcanaTcgDbPath());
const hasNaruto = existsSync(narutoPackDbPath(NARUTO_PACK_ID));
const hasDbsCg = existsSync(dbsCgDbPath());
const hasMtg = existsSync("data/mtg/catalog.sqlite");
const hasPokemonSealed = existsSync(packProductsIndexPath("pokemon"));
const hasLorcanaSealed = existsSync(packProductsIndexPath("lorcana"));

describe.skipIf(!hasPokemon)("bench listCatalogueCards pokemon", () => {
  afterEach(() => {
    resetCatalogueCardsCache();
    clearPokemonCatalogueBrowseCache();
  });

  it(
    "SQL page is fast; warm listCatalogueCards stays interactive",
    async () => {
      const { listPokemonCatalogueBrowsePage } = await import(
        "@/providers/pokemon/tcgdex/catalogueBrowse"
      );
      resetCatalogueCardsCache();
      clearPokemonCatalogueBrowseCache();
      const sqlCold = await ms(async () => {
        listPokemonCatalogueBrowsePage({
          langs: ["fr"],
          offset: 0,
          limit: 48,
        });
      });
      // First listCatalogueCards may seed *cards.fr (tens of seconds once);
      // warm must stay snappy after that.
      const cold = await ms(() =>
        listCatalogueCards({ pack: "pokemon", preferLang: "fr", limit: 48 }),
      );
      const warm = await ms(() =>
        listCatalogueCards({ pack: "pokemon", preferLang: "fr", limit: 48 }),
      );
      expect(sqlCold).toBeLessThan(2_000);
      expect(warm).toBeLessThan(2_000);
      // eslint-disable-next-line no-console -- bench visibility
      console.log(
        `pokemon sql=${sqlCold.toFixed(0)}ms cards cold=${cold.toFixed(0)}ms warm=${warm.toFixed(0)}ms`,
      );
    },
    180_000,
  );
});

describe.skipIf(!hasLorcana)("bench listCatalogueCards lorcana", () => {
  afterEach(() => {
    resetCatalogueCardsCache();
    clearLorcanaCatalogueBrowseCache();
  });

  it(
    "SQL page is fast; warm listCatalogueCards stays interactive",
    async () => {
      const { listLorcanaCatalogueBrowsePageRows } = await import(
        "@/providers/lorcana/lorcanatcg/catalogueBrowse"
      );
      resetCatalogueCardsCache();
      clearLorcanaCatalogueBrowseCache();
      const sqlCold = await ms(async () => {
        listLorcanaCatalogueBrowsePageRows({
          langs: ["en"],
          offset: 0,
          limit: 48,
        });
      });
      const cold = await ms(() =>
        listCatalogueCards({ pack: "lorcana", preferLang: "en", limit: 48 }),
      );
      const warm = await ms(() =>
        listCatalogueCards({ pack: "lorcana", preferLang: "en", limit: 48 }),
      );
      expect(sqlCold).toBeLessThan(2_000);
      expect(warm).toBeLessThan(2_000);
      // eslint-disable-next-line no-console -- bench visibility
      console.log(
        `lorcana sql=${sqlCold.toFixed(0)}ms cards cold=${cold.toFixed(0)}ms warm=${warm.toFixed(0)}ms`,
      );
    },
    180_000,
  );
});

describe.skipIf(!hasNaruto)("bench listCatalogueCards naruto/carddass", () => {
  afterEach(() => {
    resetCatalogueCardsCache();
    clearCarddassCatalogueBrowseCache();
  });

  it(
    "SQL page is fast; warm listCatalogueCards stays interactive",
    async () => {
      const { listCarddassCatalogueBrowsePage } = await import(
        "@/providers/naruto/narutocarddass/catalogueBrowse"
      );
      resetCatalogueCardsCache();
      clearCarddassCatalogueBrowseCache();
      const sqlCold = await ms(() =>
        listCarddassCatalogueBrowsePage({
          langs: ["fr"],
          offset: 0,
          limit: 48,
        }),
      );
      const warm = await ms(() =>
        listCatalogueCards({
          pack: "naruto/carddass",
          preferLang: "fr",
          limit: 48,
        }),
      );
      expect(sqlCold).toBeLessThan(2_000);
      expect(warm).toBeLessThan(2_000);
      // eslint-disable-next-line no-console -- bench visibility
      console.log(
        `naruto sql=${sqlCold.toFixed(0)}ms cards warm=${warm.toFixed(0)}ms`,
      );
    },
    60_000,
  );
});

describe.skipIf(!hasDbsCg)("bench listCatalogueCards dragonball/cg", () => {
  afterEach(() => {
    resetCatalogueCardsCache();
    clearDbsCgCatalogueBrowseCache();
  });

  it(
    "SQL page is fast; warm listCatalogueCards stays interactive",
    async () => {
      const { listDbsCgCatalogueBrowsePageRows } = await import(
        "@/providers/dragonball/dbscg/catalogueBrowse"
      );
      resetCatalogueCardsCache();
      clearDbsCgCatalogueBrowseCache();
      const sqlCold = await ms(() =>
        listDbsCgCatalogueBrowsePageRows({
          langs: ["fr"],
          offset: 0,
          limit: 48,
        }),
      );
      const warm = await ms(() =>
        listCatalogueCards({
          pack: "dragonball/cg",
          preferLang: "fr",
          limit: 48,
        }),
      );
      expect(sqlCold).toBeLessThan(2_000);
      expect(warm).toBeLessThan(2_000);
      // eslint-disable-next-line no-console -- bench visibility
      console.log(
        `dbs cg sql=${sqlCold.toFixed(0)}ms cards warm=${warm.toFixed(0)}ms`,
      );
    },
    60_000,
  );
});

describe.skipIf(!hasMtg)("bench listCatalogueCards mtg", () => {
  afterEach(() => {
    resetCatalogueCardsCache();
    clearMtgCatalogueBrowseCache();
    clearLocalPrintsIndexSingletons("mtg");
  });

  it(
    "SQL page is fast; warm listCatalogueCards stays interactive",
    async () => {
      const { listMtgCatalogueBrowsePage } = await import(
        "@/providers/mtg/catalogueBrowse"
      );
      resetCatalogueCardsCache();
      clearMtgCatalogueBrowseCache();
      clearLocalPrintsIndexSingletons("mtg");
      const sqlCold = await ms(() =>
        listMtgCatalogueBrowsePage({
          langs: ["en"],
          offset: 0,
          limit: 48,
        }),
      );
      const warm = await ms(() =>
        listCatalogueCards({
          pack: "mtg",
          preferLang: "en",
          locales: "preferred",
          limit: 48,
        }),
      );
      const missingWarm = await ms(() =>
        listCatalogueCards({
          pack: "mtg",
          preferLang: "en",
          locales: "preferred",
          missingArtOnly: true,
          limit: 48,
        }),
      );
      expect(sqlCold).toBeLessThan(3_000);
      expect(warm).toBeLessThan(3_000);
      expect(missingWarm).toBeLessThan(5_000);
      // eslint-disable-next-line no-console -- bench visibility
      console.log(
        `mtg sql=${sqlCold.toFixed(0)}ms cards warm=${warm.toFixed(0)}ms missingArt=${missingWarm.toFixed(0)}ms`,
      );
    },
    120_000,
  );
});

describe.skipIf(!hasPokemonSealed)("bench listCatalogueProducts pokemon", () => {
  afterEach(() => {
    resetCatalogueProductsCache();
  });

  it("cold then warm for sealed browse", async () => {
    resetCatalogueProductsCache();
    const cold = await ms(() =>
      listCatalogueProducts({ pack: "pokemon", limit: 48 }),
    );
    const warm = await ms(() =>
      listCatalogueProducts({ pack: "pokemon", limit: 48 }),
    );
    // skipDiskFinalize + role-URL reuse: warm must be cheap; cold under old ~227s.
    expect(cold).toBeLessThan(30_000);
    expect(warm).toBeLessThan(2_000);
    // eslint-disable-next-line no-console -- bench visibility
    console.log(
      `pokemon sealed cold=${cold.toFixed(0)}ms warm=${warm.toFixed(0)}ms`,
    );
  });
});

describe.skipIf(!hasLorcanaSealed)("bench listCatalogueProducts lorcana", () => {
  afterEach(() => {
    resetCatalogueProductsCache();
  });

  it("cold then warm for sealed browse", async () => {
    resetCatalogueProductsCache();
    const cold = await ms(() =>
      listCatalogueProducts({ pack: "lorcana", limit: 48 }),
    );
    const warm = await ms(() =>
      listCatalogueProducts({ pack: "lorcana", limit: 48 }),
    );
    expect(cold).toBeLessThan(15_000);
    expect(warm).toBeLessThan(2_000);
    // eslint-disable-next-line no-console -- bench visibility
    console.log(
      `lorcana sealed cold=${cold.toFixed(0)}ms warm=${warm.toFixed(0)}ms`,
    );
  });
});
