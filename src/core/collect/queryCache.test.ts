import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import {
  clearFinishedMetadataRefreshStamps,
  patchCachedItem,
  patchCachedShelf,
  shelfListItemMissingAttachments,
} from "./queryCache";
import { METADATA_REFRESH_STAMP_PRESERVE_MS } from "./enrichment";

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

  it("inserts into a slug-keyed shelf query when the item has the shelf cuid", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["shelf", "sega-dreamcast", ""], {
      id: "cuid-dreamcast",
      slug: "sega-dreamcast",
      name: "Sega Dreamcast",
      items: [{ id: "item-1", name: "Sonic", shelfId: "cuid-dreamcast" }],
    });

    patchCachedItem(
      queryClient,
      {
        id: "item-2",
        shelfId: "cuid-dreamcast",
        name: "NBA 2K2",
        shelf: { id: "cuid-dreamcast", slug: "sega-dreamcast" },
      },
      { isCreate: true },
    );

    const shelf = queryClient.getQueryData<{
      items: Array<{ id: string; name: string }>;
    }>(["shelf", "sega-dreamcast", ""]);

    expect(shelf?.items).toHaveLength(2);
    expect(shelf?.items[0]).toMatchObject({ id: "item-2", name: "NBA 2K2" });
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
    queryClient.setQueryData(
      ["shelves", ""],
      [
        {
          id: "shelf-1",
          name: "Games",
          _count: { items: 1 },
        },
      ],
    );

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
    queryClient.setQueryData(
      ["collectionItems", "", "all"],
      [
        {
          id: "item-1",
          name: "Mario",
          shelfId: "shelf-1",
          shelf: { id: "shelf-1", cardFormat: "default", type: "games" },
        },
      ],
    );

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

describe("shelfListItemMissingAttachments", () => {
  it("flags enriched list items that omit every attachment row", () => {
    expect(
      shelfListItemMissingAttachments({
        metadataId: "meta-1",
        metadata: { attachments: [] },
      }),
    ).toBe(true);
    expect(
      shelfListItemMissingAttachments({
        metadataId: "meta-1",
        metadata: { attachments: [{ url: "/uploads/x.jpg" }] },
      }),
    ).toBe(false);
    expect(shelfListItemMissingAttachments({ metadataId: null })).toBe(false);
  });
});

describe("clearFinishedMetadataRefreshStamps", () => {
  it("clears a finished refresh stamp when the item is no longer in jobs", () => {
    const queryClient = new QueryClient();
    const startedAt = new Date(
      Date.now() - METADATA_REFRESH_STAMP_PRESERVE_MS - 1,
    ).toISOString();
    queryClient.setQueryData(["shelf", "ps3", "items", "item-1"], {
      id: "item-1",
      shelfId: "ps3",
      metadataRefreshStartedAt: startedAt,
    });

    clearFinishedMetadataRefreshStamps(queryClient, new Set());

    expect(
      queryClient.getQueryData<{ metadataRefreshStartedAt: string | null }>([
        "shelf",
        "ps3",
        "items",
        "item-1",
      ])?.metadataRefreshStartedAt,
    ).toBeNull();
  });

  it("keeps a stamp still inside the optimistic race window", () => {
    const queryClient = new QueryClient();
    const startedAt = new Date().toISOString();
    queryClient.setQueryData(["shelf", "ps3", "items", "item-1"], {
      id: "item-1",
      shelfId: "ps3",
      metadataRefreshStartedAt: startedAt,
    });

    clearFinishedMetadataRefreshStamps(queryClient, new Set());

    expect(
      queryClient.getQueryData<{ metadataRefreshStartedAt: string | null }>([
        "shelf",
        "ps3",
        "items",
        "item-1",
      ])?.metadataRefreshStartedAt,
    ).toBe(startedAt);
  });

  it("keeps a stamp while the item is still listed as an active job", () => {
    const queryClient = new QueryClient();
    const startedAt = new Date(
      Date.now() - METADATA_REFRESH_STAMP_PRESERVE_MS - 1,
    ).toISOString();
    queryClient.setQueryData(["shelf", "ps3", "items", "item-1"], {
      id: "item-1",
      shelfId: "ps3",
      metadataRefreshStartedAt: startedAt,
    });

    clearFinishedMetadataRefreshStamps(queryClient, new Set(["item-1"]));

    expect(
      queryClient.getQueryData<{ metadataRefreshStartedAt: string | null }>([
        "shelf",
        "ps3",
        "items",
        "item-1",
      ])?.metadataRefreshStartedAt,
    ).toBe(startedAt);
  });
});
