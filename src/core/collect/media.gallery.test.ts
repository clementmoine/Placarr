import { describe, expect, it } from "vitest";

import { getGalleryImages, mergeCoverAttachmentsForPicker, orderedCoverAttachmentsForDisplay } from "./media";

describe("orderedCoverAttachmentsForDisplay", () => {
  it("pins metadata.imageUrl first then keeps storage order", () => {
    const item = {
      metadata: {
        imageUrl: "/uploads/b.jpg",
        attachments: [
          { type: "cover", source: "pricecharting", url: "/uploads/a.jpg" },
          { type: "cover", source: "steamgriddb", url: "/uploads/b.jpg" },
          { type: "cover", source: "steamgriddb", url: "/uploads/c.jpg" },
        ],
      },
    };

    expect(
      orderedCoverAttachmentsForDisplay(item).map(
        (attachment) => attachment.url,
      ),
    ).toEqual(["/uploads/b.jpg", "/uploads/a.jpg", "/uploads/c.jpg"]);
  });

  it("keeps disc art in the cover gallery after box fronts", () => {
    const item = {
      metadata: {
        imageUrl: "/uploads/box-eu.jpg",
        attachments: [
          {
            type: "cover",
            source: "screenscraper",
            role: "eu",
            url: "/uploads/box-eu.jpg",
          },
          {
            type: "image",
            source: "screenscraper",
            role: "disc-fr",
            url: "/uploads/disc-fr.jpg",
          },
        ],
      },
    };

    expect(
      orderedCoverAttachmentsForDisplay(item).map(
        (attachment) => attachment.url,
      ),
    ).toEqual(["/uploads/box-eu.jpg", "/uploads/disc-fr.jpg"]);
  });

  it("lists disc art first in the cover gallery for loose games", () => {
    const item = {
      condition: "loose",
      shelf: { type: "games", name: "PlayStation 2" },
      metadata: {
        imageUrl: "/uploads/box-eu.jpg",
        attachments: [
          {
            type: "cover",
            source: "screenscraper",
            role: "eu",
            url: "/uploads/box-eu.jpg",
          },
          {
            type: "image",
            source: "screenscraper",
            role: "disc-fr",
            url: "/uploads/disc-fr.jpg",
          },
        ],
      },
    };

    expect(
      orderedCoverAttachmentsForDisplay(item).map(
        (attachment) => attachment.url,
      ),
    ).toEqual(["/uploads/disc-fr.jpg", "/uploads/box-eu.jpg"]);
  });

  it("hides covers that explicitly target another console than the shelf", () => {
    const item = {
      metadata: {
        imageUrl: "/uploads/ps4-default.jpg",
        attachments: [
          {
            type: "cover",
            source: "pricecharting",
            url: "/uploads/ps4-default.jpg",
            title: "Main Image",
          },
          {
            type: "cover",
            source: "geedie",
            role: "eu",
            url: "/uploads/geedie-ps5.jpg",
            title: "PS5 Metal Gear Solid: Master Collection Vol. 1",
            strictShelfPlatformCoverSource: true,
          },
          {
            type: "cover",
            source: "chocobonplan",
            role: "fr",
            url: "/uploads/choco-ps5.jpg",
            title:
              "Metal Gear Solid Master Collection Volume 1 ps5 visuel produit",
            strictShelfPlatformCoverSource: true,
            retailCatalogImageTitlesSource: true,
          },
        ],
      },
      shelf: { type: "games", name: "PlayStation 4" },
    };

    expect(
      orderedCoverAttachmentsForDisplay(item).map(
        (attachment) => attachment.url,
      ),
    ).toEqual(["/uploads/ps4-default.jpg"]);
  });

  it("ranks catalog art before low-resolution listing photos in gallery order", () => {
    const item = {
      metadata: {
        imageUrl: "/uploads/geedie-cover.jpg",
        attachments: [
          {
            type: "cover" as const,
            source: "icollect",
            coverProvenance: "listing_photo",
            url: "/uploads/icollect-thumb.jpg",
            width: 140,
            height: 196,
          },
          {
            type: "cover" as const,
            source: "geedie",
            coverProvenance: "catalog",
            url: "/uploads/geedie-cover.jpg",
            width: 454,
            height: 640,
          },
        ],
      },
      shelf: { type: "games", name: "PlayStation 4" },
    };

    expect(
      orderedCoverAttachmentsForDisplay(item).map(
        (attachment) => attachment.source,
      ),
    ).toEqual(["geedie", "icollect"]);
  });

  it("keeps Geedie covers visible but ranks explicit PS4 art first on a PS4 shelf", () => {
    const item = {
      metadata: {
        attachments: [
          {
            type: "cover" as const,
            source: "geedie",
            role: "eu",
            url: "/uploads/78e2afc0409d9fdb969fd5acb2b9f3de.webp",
            strictShelfPlatformCoverSource: true,
          },
          {
            type: "cover" as const,
            source: "icollect",
            url: "/uploads/icollect-ps4.jpg",
            title: "PS4 Metal Gear Solid Master Collection Vol. 1",
          },
        ],
      },
      shelf: { type: "games", name: "playstation-4" },
    };

    expect(
      orderedCoverAttachmentsForDisplay(item).map(
        (attachment) => attachment.source,
      ),
    ).toEqual(["icollect", "geedie"]);
  });

  it("ranks FR catalog covers before marketplace extras in the picker merge", () => {
    const item = {
      metadata: {
        imageUrl: "/uploads/bdovore.jpg",
        attachments: [
          {
            type: "cover" as const,
            source: "bdovore",
            role: "fr",
            url: "/uploads/bdovore.jpg",
            width: 640,
            height: 900,
          },
          {
            type: "cover" as const,
            source: "ebay",
            role: "marketplace",
            url: "/uploads/ebay.jpg",
            width: 1400,
            height: 2000,
          },
        ],
      },
    };
    const pickerExtras = [
      {
        type: "cover" as const,
        source: "booknode",
        role: "fr",
        url: "https://cdn1.booknode.com/example/mod11.webp",
        width: 400,
        height: 600,
      },
    ];

    expect(
      mergeCoverAttachmentsForPicker(item, pickerExtras).map(
        (attachment) => attachment.source,
      ),
    ).toEqual(["bdovore", "booknode", "ebay"]);
  });

  it("does not pin a marketplace metadata default ahead of FR catalog covers", () => {
    const booknode =
      "https://cdn1.booknode.com/book_cover/1691/full/super-picsou-geant-n1-1691432.jpg";
    const item = {
      metadata: {
        imageUrl: "/uploads/ebay-listing.jpg",
        attachments: [
          {
            type: "cover" as const,
            source: "ebay",
            role: "marketplace",
            url: "/uploads/ebay-listing.jpg",
            width: 1400,
            height: 2000,
          },
          {
            type: "cover" as const,
            source: "booknode",
            role: "fr",
            url: booknode,
            width: 400,
            height: 600,
          },
        ],
      },
      shelf: { type: "books", name: "Les Trésors de Picsou" },
    };

    expect(
      orderedCoverAttachmentsForDisplay(item).map(
        (attachment) => attachment.source,
      ),
    ).toEqual(["booknode", "ebay"]);
  });

  it("lists user uploads first in the cover picker ahead of catalog grids", () => {
    const item = {
      imageUrl: "/uploads/my-disc.jpg",
      metadata: {
        imageUrl: "/uploads/grid.jpg",
        attachments: [
          {
            type: "cover" as const,
            source: "steamgriddb",
            role: "grid-vertical",
            url: "/uploads/grid.jpg",
            title: "SteamGridDB - white_logo",
            width: 600,
            height: 900,
          },
          {
            type: "image" as const,
            source: "user",
            url: "/uploads/my-disc.jpg",
            width: 800,
            height: 800,
          },
        ],
      },
      shelf: { type: "games", name: "Xbox One" },
    };

    expect(
      mergeCoverAttachmentsForPicker(item, []).map(
        (attachment) => attachment.source,
      ),
    ).toEqual(["user", "steamgriddb"]);
  });

  it("keeps Booknode provenance when an honor pin shares the same upload URL", () => {
    const item = {
      imageUrl: "/uploads/wakfu-cover.jpg",
      metadata: {
        imageUrl: "/uploads/wakfu-cover.jpg",
        attachments: [
          {
            type: "image" as const,
            source: "user",
            url: "/uploads/wakfu-cover.jpg",
          },
          {
            type: "cover" as const,
            source: "booknode",
            role: "fr",
            url: "/uploads/wakfu-cover.jpg",
            providerLabel: "Booknode",
          },
          {
            type: "cover" as const,
            source: "senscritique",
            role: "fr",
            url: "/uploads/other.jpg",
            providerLabel: "SensCritique",
          },
        ],
      },
      shelf: { type: "books", name: "Mangas" },
    };

    const ranked = mergeCoverAttachmentsForPicker(item, []);
    const wakfu = ranked.find((attachment) =>
      attachment.url.includes("wakfu-cover"),
    );
    expect(wakfu?.source).toBe("booknode");
    expect(wakfu?.providerLabel ?? "Booknode").toBe("Booknode");
  });

  it("collapses duplicate local files referenced by multiple providers", () => {
    const item = {
      metadata: {
        imageUrl: "/uploads/cover_crop.jpg",
        attachments: [
          {
            type: "cover",
            source: "howlongtobeat",
            url: "/uploads/cover.jpg",
          },
          {
            type: "cover",
            source: "pricecharting",
            url: "/uploads/cover.jpg",
          },
          {
            type: "cover",
            source: "steamgriddb",
            url: "/uploads/other.jpg",
          },
        ],
      },
    };

    expect(
      orderedCoverAttachmentsForDisplay(item).map((attachment) => ({
        source: attachment.source,
        url: attachment.url,
      })),
    ).toEqual([
      { source: "howlongtobeat", url: "/uploads/cover.jpg" },
      { source: "steamgriddb", url: "/uploads/other.jpg" },
    ]);
  });
});

describe("getGalleryImages", () => {
  it("lists covers in enrichment order instead of re-ranking heuristics", () => {
    const item = {
      metadata: {
        imageUrl: "/uploads/b.jpg",
        attachments: [
          { type: "cover", source: "pricecharting", url: "/uploads/a.jpg" },
          { type: "cover", source: "steamgriddb", url: "/uploads/b.jpg" },
          { type: "cover", source: "steamgriddb", url: "/uploads/c.jpg" },
        ],
      },
    };

    expect(
      getGalleryImages(item)
        .slice(0, 3)
        .map((image) => image.url),
    ).toEqual(["/uploads/b.jpg", "/uploads/a.jpg", "/uploads/c.jpg"]);
  });

  it("does not invent Perso for a provider cover localized to /uploads before metadata", () => {
    const item = {
      imageUrl: "/uploads/screenscraper-fr.png",
      metadata: null,
    };

    expect(getGalleryImages(item)).toEqual([
      {
        url: "/uploads/screenscraper-fr.png",
        type: "image",
        source: null,
        role: undefined,
        title: undefined,
        providerLabel: undefined,
        sourceNames: undefined,
      },
    ]);
  });

  it("keeps ScreenScraper when an honor pin shares the same local cover URL", () => {
    const item = {
      imageUrl: "/uploads/clone-wars.png",
      metadata: {
        imageUrl: "/uploads/clone-wars.png",
        attachments: [
          {
            type: "image" as const,
            source: "user",
            url: "/uploads/clone-wars.png",
          },
          {
            type: "cover" as const,
            source: "screenscraper",
            role: "fr",
            url: "/uploads/clone-wars.png",
            providerLabel: "ScreenScraper",
          },
        ],
      },
      shelf: { type: "games", name: "Xbox 360" },
    };

    const cover = getGalleryImages(item)[0];
    expect(cover?.source).toBe("screenscraper");
    expect(cover?.providerLabel).toBe("ScreenScraper");
  });
});
