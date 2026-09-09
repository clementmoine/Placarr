import { describe, expect, it } from "vitest";

import {
  DEFAULT_ITEM_COLLECTION_FILTERS,
  defaultItemCollectionSort,
  filterCollectionItems,
  parseItemCollectionFilters,
  parseItemCollectionSort,
  queryCollectionItems,
  sortCollectionItems,
  summarizeCollectionEstimatedValue,
} from "./collectionQuery";
import type { ItemWithMetadata } from "@/types/items";

function makeItem(
  overrides: Partial<ItemWithMetadata> & Pick<ItemWithMetadata, "id" | "name">,
): ItemWithMetadata {
  return {
    id: overrides.id,
    name: overrides.name,
    slug: null,
    imageUrl: null,
    backgroundImageUrl: null,
    createdAt: overrides.createdAt ?? new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    shelfId: "shelf-1",
    description: null,
    barcode: null,
    printKey: overrides.printKey ?? null,
    condition: overrides.condition ?? "new",
    metadataId: null,
    metadataRefreshStartedAt: null,
    metadataRefreshGeneration: 0,
    userId: "user-1",
    shelf: {
      id: "shelf-1",
      name: "PS4",
      slug: "ps4",
      type: "games",
      cardFormat: "standard",
      color: null,
      imageUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: "user-1",
    },
    metadata: overrides.metadata,
    priceNew: overrides.priceNew ?? null,
    priceUsed: overrides.priceUsed ?? null,
    priceUsedCIB: overrides.priceUsedCIB ?? null,
    priceEstimated: overrides.priceEstimated ?? null,
    priceLastUpdated: overrides.priceLastUpdated ?? null,
  } as unknown as ItemWithMetadata;
}

describe("collectionQuery", () => {
  it("filters by condition, minimum rating, and priced-only", () => {
    const items = [
      makeItem({
        id: "1",
        name: "Alpha",
        condition: "new",
        priceNew: 3000,
        metadata: {
          facts: [{ kind: "rating", value: "9/10", source: "igdb" }],
        } as unknown as ItemWithMetadata["metadata"],
      }),
      makeItem({
        id: "2",
        name: "Beta",
        condition: "used",
        priceUsedCIB: 1500,
        metadata: {
          facts: [{ kind: "rating", value: "7/10", source: "rawg" }],
        } as unknown as ItemWithMetadata["metadata"],
      }),
      makeItem({
        id: "3",
        name: "Gamma",
        condition: "new",
        metadata: {
          facts: [{ kind: "rating", value: "6/10", source: "rawg" }],
        } as unknown as ItemWithMetadata["metadata"],
      }),
    ];

    expect(
      filterCollectionItems(items, {
        ...DEFAULT_ITEM_COLLECTION_FILTERS,
        condition: "new",
      }).map((item) => item.id),
    ).toEqual(["1", "3"]);

    expect(
      filterCollectionItems(items, {
        ...DEFAULT_ITEM_COLLECTION_FILTERS,
        ratingMin: 7,
      }).map((item) => item.id),
    ).toEqual(["1", "2"]);

    expect(
      filterCollectionItems(items, {
        ...DEFAULT_ITEM_COLLECTION_FILTERS,
        pricedOnly: true,
      }).map((item) => item.id),
    ).toEqual(["1", "2"]);
  });

  it("sorts by rating and price", () => {
    const items = [
      makeItem({
        id: "cheap",
        name: "Cheap",
        priceNew: 1000,
        metadata: {
          facts: [{ kind: "rating", value: "6/10", source: "rawg" }],
        } as unknown as ItemWithMetadata["metadata"],
      }),
      makeItem({
        id: "best",
        name: "Best",
        priceNew: 5000,
        metadata: {
          facts: [{ kind: "rating", value: "9/10", source: "igdb" }],
        } as unknown as ItemWithMetadata["metadata"],
      }),
      makeItem({
        id: "mid",
        name: "Mid",
        priceNew: 2500,
        metadata: {
          facts: [{ kind: "rating", value: "7.5/10", source: "rawg" }],
        } as unknown as ItemWithMetadata["metadata"],
      }),
    ];

    expect(
      sortCollectionItems(items, "rating_desc", "games").map((item) => item.id),
    ).toEqual(["best", "mid", "cheap"]);

    expect(
      sortCollectionItems(items, "price_asc", "games").map((item) => item.id),
    ).toEqual(["cheap", "mid", "best"]);
  });

  it("sorts TCG prints by set then collector number", () => {
    const items = [
      makeItem({
        id: "rof-1",
        name: "Later set",
        printKey: "lorcana:2-1",
      }),
      makeItem({
        id: "tfc-20p",
        name: "Promo",
        printKey: "lorcana:1-20-p1",
      }),
      makeItem({
        id: "tfc-2",
        name: "Ariel",
        printKey: "lorcana:1-2",
      }),
      makeItem({
        id: "tfc-10",
        name: "Ten",
        printKey: "lorcana:1-10",
      }),
      makeItem({
        id: "orphan",
        name: "Sans clé",
      }),
    ];

    expect(
      sortCollectionItems(items, "print_asc", "tcg").map((item) => item.id),
    ).toEqual(["tfc-2", "tfc-10", "tfc-20p", "rof-1", "orphan"]);
  });

  it("parses filter params from the URL", () => {
    expect(
      parseItemCollectionFilters({
        get: (key) =>
          ({
            condition: "used",
            ratingMin: "8",
            priced: "1",
          })[key] ?? null,
      }),
    ).toEqual({
      condition: "used",
      ratingMin: 8,
      pricedOnly: true,
    });

    expect(
      parseItemCollectionFilters({
        get: (key) => (key === "condition" ? "loose" : null),
      }).condition,
    ).toBe("loose");

    expect(
      parseItemCollectionFilters({
        get: (key) => (key === "condition" ? "mint" : null),
      }).condition,
    ).toBe("all");
  });

  it("defaults TCG shelves to print binder order", () => {
    expect(defaultItemCollectionSort("tcg")).toBe("print_asc");
    expect(defaultItemCollectionSort("games")).toBe("name_asc");
    expect(parseItemCollectionSort(null, "tcg")).toBe("print_asc");
    expect(parseItemCollectionSort(null, "games")).toBe("name_asc");
    expect(parseItemCollectionSort("name_asc", "tcg")).toBe("name_asc");
    expect(parseItemCollectionSort("price_desc", "tcg")).toBe("price_desc");
  });

  it("applies filters then sort", () => {
    const items = [
      makeItem({
        id: "1",
        name: "A",
        condition: "new",
        priceNew: 2000,
        metadata: {
          facts: [{ kind: "rating", value: "8/10", source: "igdb" }],
        } as unknown as ItemWithMetadata["metadata"],
      }),
      makeItem({
        id: "2",
        name: "B",
        condition: "used",
        priceUsedCIB: 4000,
        metadata: {
          facts: [{ kind: "rating", value: "9/10", source: "igdb" }],
        } as unknown as ItemWithMetadata["metadata"],
      }),
    ];

    expect(
      queryCollectionItems(items, {
        sortBy: "price_desc",
        filters: {
          ...DEFAULT_ITEM_COLLECTION_FILTERS,
          condition: "new",
        },
        shelfType: "games",
      }).map((item) => item.id),
    ).toEqual(["1"]);
  });

  it("inclut les cotes estimées dans le total et le signale", () => {
    const items = [
      makeItem({ id: "1", name: "A", condition: "used", priceUsed: 1000 }),
      makeItem({ id: "2", name: "B", condition: "used", priceEstimated: 750 }),
      makeItem({ id: "3", name: "C", condition: "used" }),
    ];

    expect(summarizeCollectionEstimatedValue(items, "books")).toEqual({
      total: 17.5,
      includesEstimates: true,
    });

    expect(
      summarizeCollectionEstimatedValue(
        [makeItem({ id: "1", name: "A", condition: "used", priceUsed: 1000 })],
        "books",
      ),
    ).toEqual({ total: 10, includesEstimates: false });
  });
});
