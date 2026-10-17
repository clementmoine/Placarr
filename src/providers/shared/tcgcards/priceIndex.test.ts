import { describe, expect, it } from "vitest";

import {
  dbscardsFwParallelFromSlug,
  dbscardsGroupingFromSkuSuffix,
  dbscardsPriceFullRef,
  lookupDbscardsPrice,
  mergeDbscardsPriceIndexes,
  priceIndexFromDbscardsTiles,
  priceIndexFromMappedTiles,
} from "./priceIndex";
import type { DbscardsTile } from "./tile";

const MASTERS_GAME = "dbscg";
const FUSION_GAME = "dbsfw";

const tile = (over: Partial<DbscardsTile>): DbscardsTile => ({
  itemId: null,
  slug: "bt1-001-c-sample",
  ref: "bt1-001",
  sku: "BT1-001-C",
  name: "Sample",
  lang: "fr",
  priceText: "1.00€",
  price: 1,
  currency: "EUR",
  priceDeltaText: null,
  priceDelta: null,
  imageFront: null,
  imageBack: null,
  ...over,
});

describe("dbscardsGroupingFromSkuSuffix", () => {
  it("keeps Bandai parallels and drops plain rarities", () => {
    expect(dbscardsGroupingFromSkuSuffix("SPR")).toBe("spr");
    expect(dbscardsGroupingFromSkuSuffix("PR")).toBe("pr");
    expect(dbscardsGroupingFromSkuSuffix("PR02")).toBe("pr02");
    expect(dbscardsGroupingFromSkuSuffix("GDR")).toBe("gdr");
    expect(dbscardsGroupingFromSkuSuffix("P1")).toBe("p1");
    expect(dbscardsGroupingFromSkuSuffix("UC")).toBeNull();
    expect(dbscardsGroupingFromSkuSuffix("SCR")).toBeNull();
  });
});

describe("dbscardsFwParallelFromSlug", () => {
  it("maps plus / plus-plus alt arts to p1 / p2", () => {
    expect(
      dbscardsFwParallelFromSlug("en-st01-001-l-plus-alt-art-l-plus-son-goten"),
    ).toBe("p1");
    expect(
      dbscardsFwParallelFromSlug(
        "en-st01-070-scr-plus-plus-alt-art-scr-plus-plus-vegito",
      ),
    ).toBe("p2");
    expect(dbscardsFwParallelFromSlug("en-st01-001-l-son-goten")).toBeNull();
  });

  it("maps opecards parallèle slugs to p1", () => {
    expect(
      dbscardsFwParallelFromSlug("op17-001-l-parallele-edward-newgate"),
    ).toBe("p1");
  });
});

describe("dbscardsPriceFullRef", () => {
  it("uses SPR / PR from the SKU", () => {
    expect(
      dbscardsPriceFullRef(tile({ sku: "BT31-010-SPR", ref: "bt31-010" })),
    ).toBe("bt31-010-spr");
    expect(
      dbscardsPriceFullRef(tile({ sku: "BT1-014-PR", ref: "bt1-014" })),
    ).toBe("bt1-014-pr");
    expect(
      dbscardsPriceFullRef(tile({ sku: "BT31-001-UC", ref: "bt31-001" })),
    ).toBe("bt31-001");
  });

  it("uses slug parallels for Fusion World alt arts", () => {
    expect(
      dbscardsPriceFullRef(
        tile({
          sku: "ST01-001-L",
          ref: "st01-001",
          slug: "en-st01-001-l-plus-alt-art-l-plus-son-goten",
        }),
      ),
    ).toBe("st01-001-p1");
  });
});

describe("priceIndexFromDbscardsTiles", () => {
  it("indexes EUR cents by printKey and prefers FR over EN", () => {
    const index = priceIndexFromDbscardsTiles(
      [
        tile({
          sku: "BT2-103-R",
          ref: "bt2-103",
          slug: "bt2-103-r-frappe",
          name: "Frappe (EN)",
          lang: "en",
          price: 0.5,
        }),
        tile({
          sku: "BT2-103-R",
          ref: "bt2-103",
          slug: "bt2-103-r-frappe-cruelle",
          name: "Frappe cruelle",
          lang: "fr",
          price: 0.42,
        }),
      ],
      { game: MASTERS_GAME, origin: "https://www.dbscards.fr" },
    );
    expect(index[`${MASTERS_GAME}:bt2-103`]).toMatchObject({
      priceCents: 42,
      name: "Frappe cruelle",
      sourceUrl: "https://www.dbscards.fr/cards/bt2-103-r-frappe-cruelle",
    });
  });

  it("aliases Masters SPR prices onto -pr printKeys when asked", () => {
    const index = priceIndexFromDbscardsTiles(
      [
        tile({
          sku: "BT31-010-SPR",
          ref: "bt31-010",
          slug: "bt31-010-spr-goku",
          name: "Goku SPR",
          price: 34.9,
        }),
      ],
      {
        game: MASTERS_GAME,
        origin: "https://www.dbscards.fr",
        aliasSprAsPr: true,
      },
    );
    expect(index[`${MASTERS_GAME}:bt31-010-spr`]?.priceCents).toBe(3490);
    expect(index[`${MASTERS_GAME}:bt31-010-pr`]?.priceCents).toBe(3490);
  });

  it("keeps base and FW p1 prices distinct", () => {
    const index = priceIndexFromDbscardsTiles(
      [
        tile({
          sku: "ST01-001-L",
          ref: "st01-001",
          slug: "en-st01-001-l-son-goten",
          name: "Son Goten",
          lang: "en",
          price: 0.95,
        }),
        tile({
          sku: "ST01-001-L",
          ref: "st01-001",
          slug: "en-st01-001-l-plus-alt-art-l-plus-son-goten",
          name: "Son Goten Alt",
          lang: "en",
          price: 155,
        }),
      ],
      { game: FUSION_GAME, origin: "https://fw.dbscards.fr" },
    );
    expect(index[`${FUSION_GAME}:st01-001`]?.priceCents).toBe(95);
    expect(index[`${FUSION_GAME}:st01-001-p1`]?.priceCents).toBe(15500);
  });
});

describe("priceIndexFromMappedTiles", () => {
  it("keeps the higher EUR quote when several rarities share a printKey", () => {
    const index = priceIndexFromMappedTiles(
      [
        tile({
          slug: "ra03001-c-cheap",
          name: "Cheap",
          price: 0.02,
          lang: "fr",
        }),
        tile({
          slug: "ra03001-sr-dear",
          name: "Dear",
          price: 4.5,
          lang: "fr",
        }),
      ],
      {
        origin: "https://www.ygocards.fr",
        printKeyOf: () => "yugioh:ra03-fr001",
      },
    );
    expect(index["yugioh:ra03-fr001"]).toMatchObject({
      priceCents: 450,
      name: "Dear",
    });
  });

  it("indexes shop itemId and 30-day priceDelta as cents", () => {
    const index = priceIndexFromMappedTiles(
      [
        tile({
          itemId: "90441",
          slug: "asc-fr-276-pikachu",
          name: "Pikachu",
          price: 1.5,
          priceDelta: -0.25,
          lang: "fr",
        }),
      ],
      {
        origin: "https://www.pkmcards.fr",
        printKeyOf: () => "pokemon:asc-276",
      },
    );
    expect(index["pokemon:asc-276"]).toMatchObject({
      priceCents: 150,
      shopItemId: "90441",
      priceDeltaCents: -25,
    });
  });
});

describe("lookupDbscardsPrice / merge", () => {
  it("falls back between spr and pr on lookup", () => {
    const sprOnly = priceIndexFromDbscardsTiles(
      [
        tile({
          sku: "BT1-011-SPR",
          ref: "bt1-011",
          slug: "bt1-011-spr",
          price: 10,
        }),
      ],
      { game: MASTERS_GAME, origin: "https://www.dbscards.fr" },
    );
    expect(
      lookupDbscardsPrice(sprOnly, `${MASTERS_GAME}:bt1-011-pr`)?.priceCents,
    ).toBe(1000);
  });

  it("merges pack indexes without demoting FR", () => {
    const fr = priceIndexFromDbscardsTiles(
      [tile({ ref: "bt1-001", sku: "BT1-001-C", lang: "fr", price: 1 })],
      { game: MASTERS_GAME, origin: "https://www.dbscards.fr" },
    );
    const en = priceIndexFromDbscardsTiles(
      [tile({ ref: "bt1-001", sku: "BT1-001-C", lang: "en", price: 9 })],
      { game: MASTERS_GAME, origin: "https://www.dbscards.fr" },
    );
    expect(
      mergeDbscardsPriceIndexes(en, fr)[`${MASTERS_GAME}:bt1-001`]?.priceCents,
    ).toBe(100);
  });
});
