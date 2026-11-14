import { existsSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { listCatalogueCards } from "@/lib/admin/catalogueCards";

import {
  carddassSqlRowHasFoil,
  clearCarddassCatalogueBrowseCache,
  listCarddassCatalogueBrowsePage,
} from "./catalogueBrowse";
import { NARUTO_PACK_ID } from "./identity";
import { narutoPackDbPath } from "./indexStore";

vi.mock("@/lib/admin/catalogueCardPrices", () => ({
  catalogueCardPriceQuoteByPrintKey: async () => new Map(),
  catalogueCardPriceCentsByPrintKey: async () => new Map(),
}));

const hasDb = existsSync(narutoPackDbPath(NARUTO_PACK_ID));

describe("carddassSqlRowHasFoil", () => {
  it("attests S1/S2 holo vs normale from ledgers", () => {
    expect(
      carddassSqlRowHasFoil({
        setCode: "s1",
        number: "ni0001",
        printKey: "naruto:s1-ni0001",
      }),
    ).toBe(true);
    expect(
      carddassSqlRowHasFoil({
        setCode: "s2",
        number: "ni0062",
        printKey: "naruto:s2-ni0062",
      }),
    ).toBe(false);
    expect(
      carddassSqlRowHasFoil({
        setCode: "s2",
        number: "ni0084",
        printKey: "naruto:s2-ni0084",
      }),
    ).toBe(true);
  });

  it("treats prerelease keys as non-foil cardboard", () => {
    expect(
      carddassSqlRowHasFoil({
        setCode: "s1",
        number: "ni0019-prerelease",
        printKey: "naruto:s1-ni0019-prerelease",
      }),
    ).toBe(false);
  });
});

describe.skipIf(!hasDb)("carddass catalogue foilOnly SQL page", () => {
  afterEach(() => {
    clearCarddassCatalogueBrowseCache();
  });

  it("marks hasFoil on browse rows and filters foilOnly without materialize", async () => {
    const page = listCarddassCatalogueBrowsePage({
      langs: ["fr"],
      preferLang: "fr",
      localeMode: "preferred",
      offset: 0,
      limit: 48,
    });
    expect(page.total).toBeGreaterThan(100);
    expect(page.rows.some((row) => row.hasFoil)).toBe(true);
    expect(page.rows.some((row) => !row.hasFoil)).toBe(true);

    const foil = listCarddassCatalogueBrowsePage({
      langs: ["fr"],
      preferLang: "fr",
      localeMode: "preferred",
      foilOnly: true,
      offset: 0,
      limit: 24,
    });
    expect(foil.total).toBeGreaterThan(0);
    expect(foil.rows.every((row) => row.hasFoil)).toBe(true);

    const viaRouter = await listCatalogueCards({
      pack: "naruto/carddass",
      preferLang: "fr",
      foilOnly: true,
      offset: 0,
      limit: 24,
    });
    expect(viaRouter.total).toBe(foil.total);
    expect(
      viaRouter.cards
        .filter((row) => row.kind === "face")
        .every((row) => row.hasFoil),
    ).toBe(true);
  });
});
