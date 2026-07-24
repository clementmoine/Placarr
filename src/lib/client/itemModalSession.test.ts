import { describe, expect, it } from "vitest";

import {
  buildItemModalSessionInit,
  itemModalSessionKey,
} from "./itemModalSession";

describe("itemModalSession", () => {
  it("returns null while an edit item is still loading", () => {
    expect(
      itemModalSessionKey({
        isOpen: true,
        itemId: "item-1",
        item: undefined,
        shelfId: "shelf-1",
      }),
    ).toBeNull();
  });

  it("builds a stable edit session key that ignores metadata refresh stamps", () => {
    const item = {
      id: "item-1",
      metadataId: "meta-1",
      metadata: { lastFetched: new Date("2026-07-05T12:00:00.000Z") },
    } as never;

    expect(
      itemModalSessionKey({
        isOpen: true,
        itemId: "item-1",
        item,
        shelfId: "shelf-1",
      }),
    ).toBe("edit:item-1");

    expect(
      itemModalSessionKey({
        isOpen: true,
        itemId: "item-1",
        item: {
          ...item,
          metadata: { lastFetched: new Date("2026-07-05T13:00:00.000Z") },
        } as never,
        shelfId: "shelf-1",
      }),
    ).toBe("edit:item-1");
  });

  it("seeds edit sessions from stored item metadata", () => {
    const init = buildItemModalSessionInit({
      shelfId: "shelf-1",
      activeShelfForMedia: { type: "books", name: "Mangas" },
      item: {
        id: "item-1",
        shelfId: "shelf-1",
        name: "0721450083770",
        storedName: "0721450083770",
        barcode: "0721450083770",
        condition: "used",
        metadata: {
          title: "Black Stories",
          aliases: "Black Stories",
          imageUrl: "/uploads/cover.jpg",
        },
      } as never,
    });

    expect(init.formValues.name).toBe("Black Stories");
    expect(init.suggestions).toContain("Black Stories");
    expect(init.fetchedMetadata?.title).toBe("Black Stories");
    expect(init.asyncInit).toBeNull();
  });

  it("queues barcode lookup for prefilled scan sessions", () => {
    const init = buildItemModalSessionInit({
      shelfId: "shelf-1",
      activeShelfForMedia: { type: "boardgames", name: "Jeux" },
      prefilledValues: {
        barcode: "0721450083770",
        shelfId: "shelf-1",
      },
    });

    expect(init.asyncInit).toEqual({
      kind: "barcode",
      barcode: "0721450083770",
    });
  });

  it("keeps scan metadataPreview on the create session (no second barcode fetch)", () => {
    const init = buildItemModalSessionInit({
      shelfId: "shelf-ps4",
      activeShelfForMedia: { type: "games", name: "PlayStation 4" },
      prefilledValues: {
        name: "Giana Sisters",
        barcode: "8718591181450",
        shelfId: "shelf-ps4",
        metadataPreview: {
          title: "Giana Sisters - Twisted Dreams - Director's Cut",
          description: "Platformer",
          imageUrl: "https://example.com/giana.jpg",
          attachments: [
            {
              type: "cover",
              source: "screenscraper",
              url: "https://example.com/giana.jpg",
            },
          ],
        },
      },
    });

    expect(init.asyncInit).toBeNull();
    expect(init.fetchedMetadata?.title).toContain("Giana Sisters");
    expect(init.formValues.description).toBe("Platformer");
  });

  it("seeds edit cover from the dynamic default when item.imageUrl is a stale enrichment pin", () => {
    const init = buildItemModalSessionInit({
      shelfId: "shelf-1",
      activeShelfForMedia: { type: "games", name: "PlayStation 2" },
      item: {
        id: "item-1",
        shelfId: "shelf-1",
        name: "Demo",
        storedName: "Demo",
        condition: "used",
        updatedAt: "2026-07-03T10:00:00.000Z",
        imageUrl: "/uploads/pricecharting-eu.jpg",
        metadata: {
          imageUrl: "/uploads/screenscraper-fr.jpg",
          lastFetched: "2026-07-03T12:00:00.000Z",
          attachments: [
            {
              type: "cover",
              source: "pricecharting",
              role: "eu",
              url: "/uploads/pricecharting-eu.jpg",
            },
            {
              type: "cover",
              source: "screenscraper",
              role: "fr",
              url: "/uploads/screenscraper-fr.jpg",
            },
          ],
        },
        shelf: { type: "games", name: "PlayStation 2" },
      } as never,
    });

    expect(init.formValues.imageUrl).toBe("/uploads/screenscraper-fr.jpg");
  });

  it("keeps an explicit user gallery cover when seeding the edit session", () => {
    const init = buildItemModalSessionInit({
      shelfId: "shelf-1",
      activeShelfForMedia: { type: "games", name: "PlayStation 2" },
      item: {
        id: "item-1",
        shelfId: "shelf-1",
        name: "Demo",
        storedName: "Demo",
        condition: "used",
        updatedAt: "2026-07-03T19:00:00.000Z",
        imageUrl: "/uploads/pricecharting-eu.jpg",
        metadata: {
          imageUrl: "/uploads/screenscraper-fr.jpg",
          lastFetched: "2026-07-03T12:00:00.000Z",
          attachments: [
            {
              type: "cover",
              source: "pricecharting",
              role: "eu",
              url: "/uploads/pricecharting-eu.jpg",
            },
            {
              type: "cover",
              source: "screenscraper",
              role: "fr",
              url: "/uploads/screenscraper-fr.jpg",
            },
          ],
        },
        shelf: { type: "games", name: "PlayStation 2" },
      } as never,
    });

    expect(init.formValues.imageUrl).toBe("/uploads/pricecharting-eu.jpg");
  });
});
