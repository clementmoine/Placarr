import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import { patchCachedItem, patchCachedShelf } from "./queryCache";

describe("patchCachedItem", () => {
  it("inserts a newly created item into the cached shelf immediately", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["shelf", "shelf-1", ""], {
      id: "shelf-1",
      name: "Games",
      items: [{ id: "item-1", name: "Mario", shelfId: "shelf-1" }],
    });

    patchCachedItem(
      queryClient,
      {
        id: "item-2",
        shelfId: "shelf-1",
        name: "Zelda",
      },
      { isCreate: true },
    );

    const shelf = queryClient.getQueryData<{
      items: Array<{ id: string; name: string }>;
    }>(["shelf", "shelf-1", ""]);

    expect(shelf?.items).toHaveLength(2);
    expect(shelf?.items[0]?.id).toBe("item-2");
  });

  it("does not insert into a filtered shelf query when the name does not match", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["shelf", "shelf-1", "mario"], {
      id: "shelf-1",
      name: "Games",
      items: [{ id: "item-1", name: "Mario", shelfId: "shelf-1" }],
    });

    patchCachedItem(
      queryClient,
      {
        id: "item-2",
        shelfId: "shelf-1",
        name: "Zelda",
      },
      { isCreate: true },
    );

    const shelf = queryClient.getQueryData<{ items: Array<{ id: string }> }>([
      "shelf",
      "shelf-1",
      "mario",
    ]);

    expect(shelf?.items).toHaveLength(1);
    expect(shelf?.items[0]?.id).toBe("item-1");
  });

  it("bumps the shelf item count in the shelves list on create", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["shelves", ""], [
      {
        id: "shelf-1",
        name: "Games",
        _count: { items: 1 },
      },
    ]);

    patchCachedItem(
      queryClient,
      {
        id: "item-2",
        shelfId: "shelf-1",
        name: "Zelda",
      },
      { isCreate: true },
    );

    const shelves = queryClient.getQueryData<
      Array<{ id: string; _count: { items: number } }>
    >(["shelves", ""]);

    expect(shelves?.[0]?._count.items).toBe(2);
  });
});

describe("patchCachedShelf", () => {
  it("updates cardFormat on the cached shelf and nested item shelves immediately", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["shelf", "shelf-1", ""], {
      id: "shelf-1",
      name: "Games",
      cardFormat: "default",
      items: [{ id: "item-1", name: "Mario", shelfId: "shelf-1" }],
    });
    queryClient.setQueryData(["collectionItems", "", "all"], [
      {
        id: "item-1",
        name: "Mario",
        shelfId: "shelf-1",
        shelf: { id: "shelf-1", cardFormat: "default", type: "games" },
      },
    ]);

    patchCachedShelf(queryClient, {
      id: "shelf-1",
      cardFormat: "bluray",
    });

    const shelf = queryClient.getQueryData<{ cardFormat: string }>([
      "shelf",
      "shelf-1",
      "",
    ]);
    const items = queryClient.getQueryData<
      Array<{ shelf?: { cardFormat?: string } }>
    >(["collectionItems", "", "all"]);

    expect(shelf?.cardFormat).toBe("bluray");
    expect(items?.[0]?.shelf?.cardFormat).toBe("bluray");
  });
});
