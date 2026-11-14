import { existsSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { listCatalogueCards } from "@/lib/admin/catalogueCards";
import { packCatalogDb } from "@/lib/packPaths";

import {
  kayouRowHasFoil,
  listKayouCatalogueBrowsePage,
} from "./catalogueBrowse";
import { NARUTO_KAYOU_PACK_ID } from "./pack";

vi.mock("@/lib/admin/catalogueCardPrices", () => ({
  catalogueCardPriceQuoteByPrintKey: async () => new Map(),
  catalogueCardPriceCentsByPrintKey: async () => new Map(),
}));

const hasDb = existsSync(packCatalogDb(NARUTO_KAYOU_PACK_ID));

describe("kayouRowHasFoil", () => {
  it("maps rarity to shiny finishes", () => {
    expect(kayouRowHasFoil({ rarity: "HR" })).toBe(true);
    expect(kayouRowHasFoil({ rarity: "MR" })).toBe(true);
    expect(kayouRowHasFoil({ rarity: "R" })).toBe(false);
    expect(kayouRowHasFoil({ rarity: "N" })).toBe(false);
    expect(kayouRowHasFoil({ rarity: "UR" })).toBe(true);
  });
});

describe.skipIf(!hasDb)("kayou catalogue SQL browse foil", () => {
  it("sets hasFoil from rarity and filters foilOnly without materialize", async () => {
    const page = listKayouCatalogueBrowsePage({
      langs: ["en"],
      offset: 0,
      limit: 200,
    });
    expect(page.total).toBeGreaterThan(50);
    expect(page.rows.some((row) => row.hasFoil)).toBe(true);
    // Commons exist in the corpus; first SQL pages may be shiny-heavy.
    expect(page.rows.some((row) => !row.hasFoil)).toBe(true);

    const foil = listKayouCatalogueBrowsePage({
      langs: ["en"],
      foilOnly: true,
      offset: 0,
      limit: 24,
    });
    expect(foil.total).toBeGreaterThan(0);
    expect(foil.rows.every((row) => row.hasFoil)).toBe(true);
    expect(foil.total).toBeLessThan(page.total);

    const viaRouter = await listCatalogueCards({
      pack: "naruto/kayou",
      preferLang: "en",
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
