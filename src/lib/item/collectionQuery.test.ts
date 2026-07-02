import { describe, expect, it } from "vitest";

import {
  DEFAULT_ITEM_COLLECTION_FILTERS,
  filterCollectionItems,
  parseItemCollectionFilters,
  queryCollectionItems,
  sortCollectionItems,
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
      isPublic: false,
    },
    metadata: overrides.metadata,
    priceNew: overrides.priceNew ?? null,
    priceUsed: overrides.priceUsed ?? null,
    priceUsedCIB: overrides.priceUsedCIB ?? null,
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
});
