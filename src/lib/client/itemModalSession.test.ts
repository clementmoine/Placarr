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

  it("builds a stable edit session key from metadata stamp", () => {
    const key = itemModalSessionKey({
      isOpen: true,
      itemId: "item-1",
      item: {
        id: "item-1",
        metadataId: "meta-1",
        metadata: { lastFetched: new Date("2026-07-05T12:00:00.000Z") },
      } as never,
      shelfId: "shelf-1",
    });

    expect(key).toBe("edit:item-1:2026-07-05T12:00:00.000Z");
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
});
