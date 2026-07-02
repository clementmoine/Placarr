import { describe, expect, it } from "vitest";

import { getCoverImage, resolveMetadataCoverUrl, filterMetadataForShelfPlatform } from "./media";
import { getDisplayTitle, presentItem } from "./present";

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
            title: "Metal Gear Solid Master Collection Volume 1 ps5 visuel produit",
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
});

describe("filterMetadataForShelfPlatform", () => {
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
});
