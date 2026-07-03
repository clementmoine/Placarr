import { describe, expect, it } from "vitest";

import {
  getCoverImage,
  resolveMetadataCoverUrl,
  filterMetadataForShelfPlatform,
  backgroundPickerAttachments,
  backgroundPickerAttachmentsForItem,
} from "./media";
import {
  getDisplayTitle,
  presentItem,
  presentItemFromStorage,
} from "./present";

describe("getCoverImage", () => {
  it("uses canonical metadata.imageUrl when present", () => {
    expect(
      getCoverImage({
        metadata: {
          imageUrl: "/uploads/canonical-cover.jpg",
          attachments: [
            { type: "cover", source: "igdb", url: "/uploads/other.jpg" },
          ],
        },
      }),
    ).toBe("/uploads/canonical-cover.jpg");
  });

  it("prefers user local upload over metadata cover", () => {
    expect(
      getCoverImage({
        imageUrl: "/uploads/my-photo.jpg",
        metadata: {
          imageUrl: "/uploads/canonical-cover.jpg",
        },
      }),
    ).toBe("/uploads/my-photo.jpg");
  });

  it("prefers an explicit item cover over metadata.imageUrl", () => {
    expect(
      getCoverImage({
        imageUrl: "/uploads/my-choice.jpg",
        metadata: {
          imageUrl: "/uploads/canonical-cover.jpg",
          attachments: [
            { type: "cover", source: "bgg", url: "/uploads/my-choice.jpg" },
          ],
        },
      }),
    ).toBe("/uploads/my-choice.jpg");
  });

  it("honors a low-res gallery pick saved after the last enrichment", () => {
    expect(
      getCoverImage({
        imageUrl: "/uploads/icollect-lowres.jpg",
        updatedAt: "2026-07-03T19:00:00.000Z",
        metadata: {
          imageUrl: "/uploads/ebay-hires.jpg",
          lastFetched: "2026-07-03T12:00:00.000Z",
          attachments: [
            {
              type: "cover",
              source: "ebay",
              url: "/uploads/ebay-hires.jpg",
              width: 640,
              height: 900,
            },
            {
              type: "cover",
              source: "icollect",
              url: "/uploads/icollect-lowres.jpg",
              width: 261,
              height: 366,
            },
          ],
        },
        shelf: { type: "games", name: "Xbox 360" },
      }),
    ).toBe("/uploads/icollect-lowres.jpg");
  });

  it("prefers metadata cover over orphan low-res listing thumbs", () => {
    expect(
      getCoverImage({
        imageUrl: "/uploads/ebay-thumb.jpg",
        metadata: {
          imageUrl: "/uploads/geedie-cover.jpg",
          attachments: [
            {
              type: "cover",
              source: "ebay",
              url: "/uploads/ebay-thumb.jpg",
              width: 160,
              height: 225,
            },
            {
              type: "cover",
              source: "geedie",
              url: "/uploads/geedie-cover.jpg",
              width: 454,
              height: 640,
            },
          ],
        },
      }),
    ).toBe("/uploads/geedie-cover.jpg");
  });

  it("does not pin a background banner as the default cover", () => {
    expect(
      getCoverImage({
        imageUrl: "/uploads/choco-banner.jpg",
        metadata: {
          imageUrl: "/uploads/choco-banner.jpg",
          attachments: [
            {
              type: "background",
              source: "chocobonplan",
              url: "/uploads/choco-banner.jpg",
              width: 1500,
              height: 900,
            },
            {
              type: "logo",
              source: "screenscraper",
              url: "/uploads/logo.jpg",
            },
          ],
        },
        shelf: { type: "games", name: "Xbox 360" },
      }),
    ).toBeNull();
  });

  it("scores front box art above back covers", () => {
    expect(
      getCoverImage({
        metadata: {
          attachments: [
            {
              type: "cover",
              source: "provider-a",
              role: "back",
              url: "/uploads/back.jpg",
            },
            {
              type: "cover",
              source: "provider-b",
              role: "front",
              url: "/uploads/front.jpg",
            },
          ],
        },
      }),
    ).toBe("/uploads/front.jpg");
  });

  it("scores portrait box-like covers above landscape thumbnails", () => {
    expect(
      getCoverImage({
        metadata: {
          attachments: [
            {
              type: "cover",
              url: "/uploads/thumb-small.jpg",
              role: "thumb",
            },
            {
              type: "cover",
              url: "/uploads/box-front-large.jpg",
              role: "front box-2d",
            },
          ],
        },
      }),
    ).toBe("/uploads/box-front-large.jpg");
  });

  it("skips platform-mismatched metadata.imageUrl on a PS4 shelf", () => {
    const item = {
      metadata: {
        imageUrl: "/uploads/chocobonplan-ps5.jpg",
        attachments: [
          {
            type: "cover" as const,
            source: "chocobonplan",
            role: "fr",
            url: "/uploads/chocobonplan-ps5.jpg",
            title:
              "Metal Gear Solid Master Collection Volume 1 ps5 visuel produit",
          },
          {
            type: "cover" as const,
            source: "icollect",
            role: "eu",
            url: "/uploads/icollect-ps4.jpg",
            title: "PS4 Metal Gear Solid Master Collection Vol. 1",
          },
        ],
      },
      shelf: { type: "games", name: "PlayStation 4" },
    };

    expect(resolveMetadataCoverUrl(item)).toBe("/uploads/icollect-ps4.jpg");
    expect(getCoverImage(item)).toBe("/uploads/icollect-ps4.jpg");
  });

  it("prefers PS3-tagged cover over ambiguous marketplace art on a PS3 shelf", () => {
    const item = {
      imageUrl: "/uploads/amc-oblivion.jpg",
      metadata: {
        imageUrl: "/uploads/amc-oblivion.jpg",
        attachments: [
          {
            type: "cover" as const,
            source: "achatmoinscher",
            role: "fr",
            url: "/uploads/amc-oblivion.jpg",
          },
          {
            type: "cover" as const,
            source: "geedie",
            role: "eu",
            url: "/uploads/geedie-ps3-oblivion.jpg",
            title: "PS3 The Elder Scrolls IV: Oblivion 5th Anniversary Edition",
            strictShelfPlatformCoverSource: true,
          },
        ],
      },
      shelf: { type: "games", name: "PlayStation 3" },
    };

    expect(getCoverImage(item)).toBe("/uploads/geedie-ps3-oblivion.jpg");
  });

  it("keeps ambiguous marketplace cover when no platform-tagged alternative exists", () => {
    const item = {
      metadata: {
        imageUrl: "/uploads/amc-only.jpg",
        attachments: [
          {
            type: "cover" as const,
            source: "achatmoinscher",
            role: "fr",
            url: "/uploads/amc-only.jpg",
          },
        ],
      },
      shelf: { type: "games", name: "PlayStation 3" },
    };

    expect(getCoverImage(item)).toBe("/uploads/amc-only.jpg");
  });
});

describe("backgroundPickerAttachments", () => {
  it("returns dedicated backgrounds before covers", () => {
    const ranked = backgroundPickerAttachments({
      attachments: [
        { type: "cover", url: "/cover.jpg", source: "bgg" },
        { type: "background", url: "/hero.jpg", source: "philibert" },
      ],
    });

    expect(ranked.map((attachment) => attachment.url)).toEqual(["/hero.jpg"]);
  });

  it("falls back to ranked covers when no dedicated background assets exist", () => {
    const ranked = backgroundPickerAttachmentsForItem(
      {
        attachments: [
          { type: "cover", url: "/small.jpg", source: "philibert" },
          { type: "cover", url: "/large.jpg", source: "bgg", role: "fr" },
        ],
      },
      { type: "boardgames", name: "Black Stories" },
    );

    expect(ranked.map((attachment) => attachment.type)).toEqual([
      "cover",
      "cover",
    ]);
    expect(ranked.map((attachment) => attachment.url).sort()).toEqual([
      "/large.jpg",
      "/small.jpg",
    ]);
  });
});

describe("filterMetadataForShelfPlatform", () => {
  it("removes ambiguous marketplace covers from a PS3 metadata payload when PS3 art exists", () => {
    const filtered = filterMetadataForShelfPlatform(
      {
        imageUrl: "/uploads/amc-oblivion.jpg",
        attachments: [
          {
            type: "cover" as const,
            source: "achatmoinscher",
            role: "fr",
            url: "/uploads/amc-oblivion.jpg",
          },
          {
            type: "cover" as const,
            source: "geedie",
            role: "eu",
            url: "/uploads/geedie-ps3-oblivion.jpg",
            title: "PS3 The Elder Scrolls IV: Oblivion 5th Anniversary Edition",
          },
        ],
      },
      { type: "games", name: "PlayStation 3" },
    );

    expect(filtered?.attachments?.map((attachment) => attachment.url)).toEqual([
      "/uploads/geedie-ps3-oblivion.jpg",
    ]);
    expect(filtered?.imageUrl).toBe("/uploads/geedie-ps3-oblivion.jpg");
  });

  it("removes PS5 retail covers from a PS4 metadata payload", () => {
    const filtered = filterMetadataForShelfPlatform(
      {
        imageUrl: "/uploads/geedie-ps5.jpg",
        attachments: [
          {
            type: "cover" as const,
            source: "geedie",
            role: "eu",
            url: "/uploads/geedie-ps5.jpg",
            title: "PS5 Metal Gear Solid: Master Collection Vol. 1",
          },
          {
            type: "cover" as const,
            source: "icollect",
            url: "/uploads/icollect-ps4.jpg",
            title: "PS4 Metal Gear Solid Master Collection Vol. 1",
          },
          {
            type: "screenshot" as const,
            source: "chocobonplan",
            url: "/uploads/choco-shot.jpg",
          },
        ],
      },
      { type: "games", name: "PlayStation 4" },
    );

    expect(filtered?.attachments?.map((attachment) => attachment.url)).toEqual([
      "/uploads/icollect-ps4.jpg",
      "/uploads/choco-shot.jpg",
    ]);
    expect(filtered?.imageUrl).toBe("/uploads/icollect-ps4.jpg");
  });

  it("retire les placeholders génériques de la galerie", () => {
    const filtered = filterMetadataForShelfPlatform(
      {
        attachments: [
          {
            type: "cover" as const,
            source: "geedie",
            role: "eu",
            url: "/uploads/real-eu.jpg",
            width: 1025,
            height: 1302,
            meanLuminance: 93.6,
            darkPixelRatio: 0.47,
          },
          {
            type: "cover" as const,
            source: "geedie",
            role: "jp",
            url: "/uploads/placeholder-jp.png",
            width: 500,
            height: 500,
            meanLuminance: 241.9,
            darkPixelRatio: 0,
          },
        ],
      },
      { type: "games", name: "PlayStation 4" },
    );

    expect(filtered?.attachments?.map((attachment) => attachment.url)).toEqual([
      "/uploads/real-eu.jpg",
    ]);
  });

  it("strips misleading iCollect Japan labels when no rating board confirms them", () => {
    const filtered = filterMetadataForShelfPlatform(
      {
        attachments: [
          {
            type: "cover" as const,
            source: "icollect",
            role: "jp",
            url: "/uploads/icollect-eu-pegi.jpg",
            title: "Metal Gear Solid Master Collection Vol. 1 - Main Image 1",
          },
        ],
        facts: [
          {
            kind: "age-rating",
            source: "icollect",
            value: "2024-03-15 08:08:49",
          },
        ],
      },
      { type: "games", name: "PlayStation 4" },
    );

    expect(filtered?.attachments?.[0]?.role).toBeUndefined();
  });

  it("removes retail gallery covers for a different sequel than the item title", () => {
    const filtered = filterMetadataForShelfPlatform(
      {
        title: "Little Nightmare",
        attachments: [
          {
            type: "cover" as const,
            source: "chocobonplan",
            role: "fr",
            url: "/uploads/ln3.png",
            title: "little nightmares iii sur ps4 visuel produit",
            retailCatalogImageTitlesSource: true,
          },
          {
            type: "cover" as const,
            source: "pricecharting",
            url: "/uploads/ln1.png",
            title: "Main Image",
          },
        ],
      },
      { type: "games", name: "PlayStation 4" },
    );

    expect(filtered?.attachments?.map((attachment) => attachment.url)).toEqual([
      "/uploads/ln1.png",
    ]);
  });

  it("removes base-game retail covers when the item is an official trilogy", () => {
    const filtered = filterMetadataForShelfPlatform(
      {
        title: "Prince of Persia Trilogy",
        imageUrl: "/uploads/base-pop.jpg",
        attachments: [
          {
            type: "cover" as const,
            source: "geedie",
            role: "eu",
            url: "/uploads/base-pop.jpg",
            title: "PS3 Prince of Persia",
            retailCatalogImageTitlesSource: true,
          },
          {
            type: "cover" as const,
            source: "geedie",
            role: "eu",
            url: "/uploads/trilogy-pop.jpg",
            title: "PS3 Prince of Persia Trilogy: 3 Full Games",
            retailCatalogImageTitlesSource: true,
          },
        ],
      },
      { type: "games", name: "PlayStation 3" },
    );

    expect(filtered?.attachments?.map((attachment) => attachment.url)).toEqual([
      "/uploads/trilogy-pop.jpg",
    ]);
    expect(filtered?.imageUrl).toBe("/uploads/trilogy-pop.jpg");
  });

  it("removes Blu-ray retail covers from game metadata", () => {
    const filtered = filterMetadataForShelfPlatform(
      {
        title: "La Mémoire dans la peau",
        imageUrl: "/uploads/bourne-bluray.jpg",
        attachments: [
          {
            type: "cover" as const,
            source: "ebay",
            url: "/uploads/bourne-bluray.jpg",
            title: "La Mémoire dans la peau [Blu-ray]",
          },
          {
            type: "cover" as const,
            source: "launchbox",
            role: "europe",
            url: "/uploads/bourne-game.jpg",
            title: "Box - Front",
          },
        ],
      },
      { type: "games", name: "PlayStation 3" },
    );

    expect(filtered?.attachments?.map((attachment) => attachment.url)).toEqual([
      "/uploads/bourne-game.jpg",
    ]);
    expect(filtered?.imageUrl).toBe("/uploads/bourne-game.jpg");
  });

  it("drops PriceCharting no-art placeholders from gallery and default cover", () => {
    const filtered = filterMetadataForShelfPlatform(
      {
        imageUrl: "/images/no-image-available.png",
        attachments: [
          {
            type: "cover",
            source: "pricecharting",
            role: "eu",
            url: "/images/no-image-available.png",
            title: "Main Image",
          },
          {
            type: "cover",
            source: "igdb",
            url: "/uploads/real-cover.jpg",
          },
        ],
      },
      { type: "games", name: "PlayStation 4" },
    );

    expect(filtered?.imageUrl).toBe("/uploads/real-cover.jpg");
    expect(filtered?.attachments?.map((attachment) => attachment.url)).toEqual([
      "/uploads/real-cover.jpg",
    ]);
  });
});

describe("presentItem", () => {
  it("applies canonical title and cover across the payload", () => {
    const presented = presentItem({
      name: "Super Monkey Ball Banana Blitz Complet VF",
      imageUrl: null,
      metadata: {
        title: "Super Monkey Ball: Banana Blitz",
        imageUrl: "/uploads/cover.jpg",
      },
      shelf: { type: "games" },
    });

    expect(presented.name).toBe("Super Monkey Ball: Banana Blitz");
    expect(presented.storedName).toBe(
      "Super Monkey Ball Banana Blitz Complet VF",
    );
    expect(presented.imageUrl).toBe("/uploads/cover.jpg");
  });

  it("omits storedName when display title matches the stored name", () => {
    const presented = presentItem({
      name: "Mon jeu",
      metadata: { title: "Mon jeu" },
    });

    expect(presented.name).toBe("Mon jeu");
    expect(presented.storedName).toBeUndefined();
  });

  it("falls back to item name when metadata has no title", () => {
    expect(
      getDisplayTitle({
        name: "Mon jeu",
        metadata: {},
      }),
    ).toBe("Mon jeu");
  });

  it("does not keep a stored gallery cover after metadata filtering removed it", () => {
    const presented = presentItemFromStorage({
      id: "item-1",
      name: "Prince of Persia Trilogy",
      condition: "used",
      shelfId: "shelf-1",
      userId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      barcode: null,
      description: null,
      backgroundImageUrl: null,
      metadataId: "metadata-1",
      metadataRefreshStartedAt: null,
      metadataRefreshGeneration: 0,
      imageUrl: "/uploads/base-pop.jpg",
      shelf: { type: "games", name: "PlayStation 3" },
      metadata: {
        id: "metadata-1",
        title: "Prince of Persia Trilogy",
        description: null,
        releaseDate: null,
        imageUrl: "/uploads/base-pop.jpg",
        heroImageUrl: null,
        duration: null,
        pageCount: null,
        tracksCount: null,
        aliases: null,
        facts: null,
        sourceType: "games",
        sourceQuery: "Prince of Persia Trilogy",
        lastFetched: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        authors: [],
        publishers: [],
        attachments: [
          {
            id: "base",
            metadataId: "metadata-1",
            createdAt: new Date(),
            updatedAt: new Date(),
            duration: null,
            type: "cover",
            source: "geedie",
            role: "eu",
            url: "/uploads/base-pop.jpg",
            title: "PS3 Prince of Persia",
            coverProvenance: null,
            width: null,
            height: null,
            meanLuminance: null,
            darkPixelRatio: null,
          },
          {
            id: "trilogy",
            metadataId: "metadata-1",
            createdAt: new Date(),
            updatedAt: new Date(),
            duration: null,
            type: "cover",
            source: "geedie",
            role: "eu",
            url: "/uploads/trilogy-pop.jpg",
            title: "PS3 Prince of Persia Trilogy: 3 Full Games",
            coverProvenance: null,
            width: null,
            height: null,
            meanLuminance: null,
            darkPixelRatio: null,
          },
        ],
      },
    } as Parameters<typeof presentItemFromStorage>[0]);

    expect(presented.imageUrl).toBe("/uploads/trilogy-pop.jpg");
  });
});
