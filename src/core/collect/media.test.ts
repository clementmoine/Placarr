import { describe, expect, it } from "vitest";

import {
  getCoverImage,
  resolveMetadataCoverUrl,
  filterMetadataForShelfPlatform,
  backgroundPickerAttachments,
  backgroundPickerAttachmentsForItem,
  collapseCroppedUserPinWithCatalogOriginal,
  mergeCoverAttachmentsForPicker,
} from "./media";
import {
  getDisplayTitle,
  presentItem,
  presentItemFromStorage,
} from "./present";
import { formatMetadataFromStorage } from "@/core/enrich/dbMapping";
import { withProviderAttachmentTraits } from "@/core/catalog/sourceTraits";

describe("resolveMetadataCoverUrl", () => {
  it("prefers a FR catalog cover over a stale marketplace metadata.imageUrl", () => {
    const booknode =
      "https://cdn1.booknode.com/book_cover/1691/full/super-picsou-geant-n1-1691432.jpg";

    expect(
      resolveMetadataCoverUrl({
        metadata: {
          imageUrl: "/uploads/ebay-listing.jpg",
          attachments: [
            {
              type: "cover",
              source: "ebay",
              role: "marketplace",
              url: "/uploads/ebay-listing.jpg",
            },
            {
              type: "cover",
              source: "booknode",
              role: "fr",
              url: booknode,
            },
          ],
        },
        shelf: { type: "books", name: "Les Trésors de Picsou" },
      }),
    ).toBe(booknode);
  });

  it("prefers a FR catalog cover over a stale US metadata.imageUrl pin", () => {
    expect(
      resolveMetadataCoverUrl(
        {
          metadata: {
            imageUrl: "/uploads/us-geedie.jpg",
            attachments: [
              {
                type: "cover",
                source: "geedie",
                role: "us",
                url: "/uploads/us-geedie.jpg",
                providerImageScoreAdjustment: 120,
              },
              {
                type: "cover",
                source: "hdjv",
                role: "fr",
                url: "/uploads/fr-hdjv.jpg",
              },
              {
                type: "cover",
                source: "pricecharting",
                role: "eu",
                url: "/uploads/eu-pc.jpg",
              },
            ],
          },
          shelf: { type: "games", name: "Xbox 360" },
        },
        "fr",
      ),
    ).toBe("/uploads/fr-hdjv.jpg");
  });
});

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

  it("drops a stale localized crop when metadata.imageUrl no longer has a gallery row", () => {
    expect(
      getCoverImage({
        imageUrl: "/uploads/ages-or-crop.jpg",
        metadata: {
          imageUrl: "/uploads/ages-or.jpg",
          attachments: [
            {
              type: "cover",
              source: "bdovore",
              url: "/uploads/tresors.jpg",
              title: "Les trésors de Picsou n°3 : La jeunesse de Picsou",
              catalogCoverTitlesSource: true,
            },
          ],
        },
        shelf: { type: "books", name: "Les Trésors de Picsou" },
      }),
    ).toBe("/uploads/tresors.jpg");
  });

  it("prefers user local upload over metadata cover", () => {
    expect(
      getCoverImage({
        imageUrl: "/uploads/my-photo.jpg",
        updatedAt: "2026-07-03T19:00:00.000Z",
        metadata: {
          imageUrl: "/uploads/canonical-cover.jpg",
          lastFetched: "2026-07-03T12:00:00.000Z",
        },
      }),
    ).toBe("/uploads/my-photo.jpg");
  });

  it("keeps a source=user cover after enrichment refreshes lastFetched", () => {
    expect(
      getCoverImage({
        imageUrl: "/uploads/my-disc.jpg",
        updatedAt: "2026-07-03T12:00:00.000Z",
        metadata: {
          imageUrl: "/uploads/grid.jpg",
          lastFetched: "2026-07-19T10:00:00.000Z",
          attachments: [
            {
              type: "image",
              source: "user",
              url: "/uploads/my-disc.jpg",
            },
            {
              type: "cover",
              source: "steamgriddb",
              url: "/uploads/grid.jpg",
              width: 600,
              height: 900,
            },
          ],
        },
      }),
    ).toBe("/uploads/my-disc.jpg");
  });

  it("prefers an explicit item cover over metadata.imageUrl", () => {
    expect(
      getCoverImage({
        imageUrl: "/uploads/my-choice.jpg",
        updatedAt: "2026-07-03T19:00:00.000Z",
        metadata: {
          imageUrl: "/uploads/canonical-cover.jpg",
          lastFetched: "2026-07-03T12:00:00.000Z",
          attachments: [
            { type: "cover", source: "bgg", url: "/uploads/my-choice.jpg" },
          ],
        },
      }),
    ).toBe("/uploads/my-choice.jpg");
  });

  it("prefers disc art for loose games over the catalog box pin", () => {
    expect(
      getCoverImage({
        condition: "loose",
        imageUrl: "/uploads/box-eu.jpg",
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
      }),
    ).toBe("/uploads/disc-fr.jpg");
  });

  it("keeps the box cover for used games even when a disc exists", () => {
    expect(
      getCoverImage({
        condition: "used",
        imageUrl: "/uploads/box-eu.jpg",
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
      }),
    ).toBe("/uploads/box-eu.jpg");
  });

  it("keeps an explicit user cover override on loose games", () => {
    expect(
      getCoverImage({
        condition: "loose",
        imageUrl: "/uploads/my-box-pick.jpg",
        updatedAt: "2026-07-18T20:00:00.000Z",
        shelf: { type: "games", name: "PlayStation 2" },
        metadata: {
          imageUrl: "/uploads/box-eu.jpg",
          lastFetched: "2026-07-18T12:00:00.000Z",
          attachments: [
            {
              type: "cover",
              source: "screenscraper",
              role: "eu",
              url: "/uploads/my-box-pick.jpg",
            },
            {
              type: "image",
              source: "screenscraper",
              role: "disc-fr",
              url: "/uploads/disc-fr.jpg",
            },
          ],
        },
      }),
    ).toBe("/uploads/my-box-pick.jpg");
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

  it("ignores a stale enrichment item.imageUrl when metadata default moved on", () => {
    // Without an explicit user pick (updatedAt > lastFetched), display follows
    // the dynamic metadata default — not a leftover enrichment-synced pin.
    expect(
      getCoverImage({
        imageUrl: "/uploads/ebay-thumb.jpg",
        updatedAt: "2026-07-03T10:00:00.000Z",
        metadata: {
          imageUrl: "/uploads/geedie-cover.jpg",
          lastFetched: "2026-07-03T12:00:00.000Z",
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

  it("keeps an explicit gallery pick even when a higher-res catalog cover exists", () => {
    expect(
      getCoverImage({
        imageUrl: "/uploads/ebay-thumb.jpg",
        updatedAt: "2026-07-03T19:00:00.000Z",
        metadata: {
          imageUrl: "/uploads/geedie-cover.jpg",
          lastFetched: "2026-07-03T12:00:00.000Z",
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
    ).toBe("/uploads/ebay-thumb.jpg");
  });

  it("honors an explicit SteamGridDB gallery pick even when a shelf box cover exists", () => {
    expect(
      getCoverImage({
        imageUrl: "/uploads/grid-alt.jpg",
        updatedAt: "2026-07-19T18:00:00.000Z",
        shelf: { type: "games", name: "PlayStation 3" },
        metadata: {
          imageUrl: "/uploads/grid-default.jpg",
          lastFetched: "2026-07-19T12:00:00.000Z",
          attachments: [
            {
              type: "cover",
              source: "steamgriddb",
              role: "grid-vertical",
              url: "/uploads/grid-default.jpg",
              width: 600,
              height: 900,
            },
            {
              type: "cover",
              source: "steamgriddb",
              role: "grid-vertical",
              url: "/uploads/grid-alt.jpg",
              width: 600,
              height: 900,
            },
            {
              type: "cover",
              source: "screenscraper",
              role: "eu",
              url: "/uploads/box-eu.jpg",
              width: 600,
              height: 900,
            },
          ],
        },
      }),
    ).toBe("/uploads/grid-alt.jpg");
  });

  it("honors a source=user gallery pick after enrichment refreshes lastFetched", () => {
    expect(
      getCoverImage({
        imageUrl: "/uploads/grid-alt_crop.jpg",
        updatedAt: "2026-07-19T12:00:00.000Z",
        shelf: { type: "games", name: "PlayStation 3" },
        metadata: {
          imageUrl: "/uploads/grid-default.jpg",
          lastFetched: "2026-07-19T18:00:00.000Z",
          attachments: [
            {
              type: "cover",
              source: "steamgriddb",
              role: "grid-vertical",
              url: "/uploads/grid-alt.jpg",
              width: 600,
              height: 900,
            },
            {
              type: "image",
              source: "user",
              url: "/uploads/grid-alt_crop.jpg",
            },
            {
              type: "cover",
              source: "screenscraper",
              role: "eu",
              url: "/uploads/box-eu.jpg",
              width: 600,
              height: 900,
            },
          ],
        },
      }),
    ).toBe("/uploads/grid-alt_crop.jpg");
  });

  it("does not let an orphan source=user pin override a marketplace item cover", () => {
    expect(
      getCoverImage({
        imageUrl: "/uploads/ebay_crop.jpg",
        updatedAt: "2026-07-19T12:00:00.000Z",
        shelf: { type: "games", name: "PlayStation Vita" },
        metadata: {
          imageUrl: "/uploads/ebay_crop.jpg",
          lastFetched: "2026-07-19T18:00:00.000Z",
          attachments: [
            {
              type: "cover",
              source: "ebay",
              role: "marketplace",
              url: "/uploads/ebay_crop.jpg",
              width: 400,
              height: 560,
            },
            {
              type: "cover",
              source: "merged",
              url: "/uploads/merged.jpg",
              width: 600,
              height: 900,
            },
            {
              type: "image",
              source: "user",
              url: "/uploads/merged.jpg",
            },
          ],
        },
      }),
    ).toBe("/uploads/merged.jpg");
  });

  it("honors a marketplace cover once the user pin matches it", () => {
    expect(
      getCoverImage({
        imageUrl: "/uploads/ebay_crop.jpg",
        updatedAt: "2026-07-19T19:00:00.000Z",
        shelf: { type: "games", name: "PlayStation Vita" },
        metadata: {
          imageUrl: "/uploads/ebay_crop.jpg",
          lastFetched: "2026-07-19T12:00:00.000Z",
          attachments: [
            {
              type: "cover",
              source: "ebay",
              role: "marketplace",
              url: "/uploads/ebay_crop.jpg",
              width: 400,
              height: 560,
            },
            {
              type: "cover",
              source: "merged",
              url: "/uploads/merged.jpg",
              width: 600,
              height: 900,
            },
            {
              type: "image",
              source: "user",
              url: "/uploads/ebay_crop.jpg",
            },
          ],
        },
      }),
    ).toBe("/uploads/ebay_crop.jpg");
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

  it("keeps a pinned SteamGridDB grid when only Xbox One box art exists on an Xbox Series shelf", () => {
    const item = {
      metadata: {
        imageUrl: "/uploads/grid.jpg",
        attachments: [
          {
            type: "cover" as const,
            source: "steamgriddb",
            role: "grid-vertical",
            url: "/uploads/grid.jpg",
            platformKey: "xboxseries",
            width: 900,
            height: 1200,
          },
          {
            type: "cover" as const,
            source: "screenscraper",
            role: "eu",
            url: "/uploads/xboxone-box.jpg",
            platformKey: "xboxone",
            width: 800,
            height: 1200,
          },
        ],
      },
      shelf: { type: "games", name: "Xbox Series" },
    };

    expect(resolveMetadataCoverUrl(item)).toBe("/uploads/grid.jpg");
    expect(getCoverImage(item)).toBe("/uploads/grid.jpg");
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
  it("keeps ambiguous marketplace covers but pins the PS3 art as default", () => {
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

    // The platform-ambiguous cover is NOT removed — it stays available…
    expect(filtered?.attachments?.map((attachment) => attachment.url)).toEqual([
      "/uploads/amc-oblivion.jpg",
      "/uploads/geedie-ps3-oblivion.jpg",
    ]);
    // …but the shelf-platform box art becomes the default cover.
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
          withProviderAttachmentTraits({
            type: "cover" as const,
            source: "icollect",
            role: "jp",
            url: "/uploads/icollect-eu-pegi.jpg",
            title: "Metal Gear Solid Master Collection Vol. 1 - Main Image 1",
          }),
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

  it("drops a mismatched BDovore catalog cover for another comic line", () => {
    const filtered = filterMetadataForShelfPlatform(
      {
        title: "Les Trésors de Picsou n°1",
        imageUrl: "/uploads/ages-or.jpg",
        attachments: [
          withProviderAttachmentTraits({
            type: "cover" as const,
            source: "bdovore",
            url: "/uploads/ages-or.jpg",
            title: "Les âges d'or de Picsou, Tome 1",
          }),
          withProviderAttachmentTraits({
            type: "cover" as const,
            source: "bdovore",
            url: "/uploads/tresors.jpg",
            title: "Les trésors de Picsou n°1 : La jeunesse de Picsou",
          }),
        ],
      },
      { type: "books", name: "Les Trésors de Picsou" },
    );

    expect(filtered?.attachments?.map((attachment) => attachment.url)).toEqual([
      "/uploads/tresors.jpg",
    ]);
    expect(filtered?.imageUrl).toBe("/uploads/tresors.jpg");
  });

  it("keeps metadata.imageUrl on a platform shelf when gallery rows are missing", () => {
    const filtered = filterMetadataForShelfPlatform(
      {
        imageUrl: "/uploads/vita-angry-birds.jpg",
        attachments: [],
      },
      { type: "games", name: "PlayStation Vita" },
    );

    expect(filtered?.imageUrl).toBe("/uploads/vita-angry-birds.jpg");
    expect(filtered?.attachments).toEqual([]);
  });

  it("does not resurrect a wrong-platform cover dropped from the gallery", () => {
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
        ],
      },
      { type: "games", name: "PlayStation 4" },
    );

    expect(filtered?.attachments).toEqual([]);
    expect(filtered?.imageUrl).toBeUndefined();
  });

  it("drops a NetGamesRetro Wii cover from a PlayStation Vita shelf", () => {
    const filtered = filterMetadataForShelfPlatform(
      {
        imageUrl: "/uploads/netgamesretro-wii.jpg",
        attachments: [
          withProviderAttachmentTraits({
            type: "cover" as const,
            source: "netgamesretro",
            role: "fr",
            url: "/uploads/netgamesretro-wii.jpg",
            platformKey: "wii",
          }),
          {
            type: "cover" as const,
            source: "screenscraper",
            role: "us",
            url: "/uploads/vita-2d.jpg",
            platformKey: "psvita",
          },
        ],
      },
      { type: "games", name: "PlayStation Vita" },
    );

    expect(filtered?.attachments?.map((attachment) => attachment.url)).toEqual([
      "/uploads/vita-2d.jpg",
    ]);
    expect(filtered?.imageUrl).toBe("/uploads/vita-2d.jpg");
  });

  it("drops an HDJV Xbox 360 cover from a PlayStation Vita shelf", () => {
    const filtered = filterMetadataForShelfPlatform(
      {
        imageUrl:
          "https://www.historiquedesjeuxvideo.com/bdd/jeu/img/XBox-360/2734.jpg",
        attachments: [
          withProviderAttachmentTraits({
            type: "cover" as const,
            source: "hdjv",
            role: "fr",
            url: "https://www.historiquedesjeuxvideo.com/bdd/jeu/img/XBox-360/2734.jpg",
            platformKey: "xbox360",
          }),
          {
            type: "cover" as const,
            source: "screenscraper",
            role: "us",
            url: "/uploads/vita-2d.jpg",
            platformKey: "psvita",
          },
        ],
      },
      { type: "games", name: "PlayStation Vita" },
    );

    expect(filtered?.attachments?.map((attachment) => attachment.url)).toEqual([
      "/uploads/vita-2d.jpg",
    ]);
    expect(filtered?.imageUrl).toBe("/uploads/vita-2d.jpg");
  });

  it("drops a PS4 barcode from metadata on a PlayStation Vita shelf", () => {
    const filtered = filterMetadataForShelfPlatform(
      {
        title: "La Grande Aventure LEGO Le Jeu Vidéo",
        barcode: "5051889325581",
        platformKey: "ps4",
      },
      { type: "games", name: "PlayStation Vita" },
    );

    expect(filtered?.barcode).toBeUndefined();
  });

  it("drops a NetGamesRetro 3DS cover from a PlayStation Vita shelf", () => {
    const filtered = filterMetadataForShelfPlatform(
      {
        imageUrl: "/uploads/netgamesretro-3ds.jpg",
        attachments: [
          withProviderAttachmentTraits({
            type: "cover" as const,
            source: "netgamesretro",
            role: "fr",
            url: "/uploads/netgamesretro-3ds.jpg",
            platformKey: "3ds",
          }),
          {
            type: "cover" as const,
            source: "screenscraper",
            role: "us",
            url: "/uploads/vita-2d.jpg",
            platformKey: "psvita",
          },
        ],
      },
      { type: "games", name: "PlayStation Vita" },
    );

    expect(filtered?.attachments?.map((attachment) => attachment.url)).toEqual([
      "/uploads/vita-2d.jpg",
    ]);
    expect(filtered?.imageUrl).toBe("/uploads/vita-2d.jpg");
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

  it("retire la jaquette AchatMoinsCher Sirènes pour Black Stories Femmes Fatales", () => {
    const attachments = [
      withProviderAttachmentTraits({
        type: "cover" as const,
        source: "achatmoinscher",
        role: "fr",
        url: "/uploads/amc-sirenes.jpg",
        title: "Sirènes : femmes fatales",
      }),
      withProviderAttachmentTraits({
        type: "cover" as const,
        source: "philibert",
        role: "fr",
        url: "/uploads/philibert-femmes-fatales.jpg",
        title: "Black Stories Femmes Fatales",
      }),
    ];
    expect(attachments[0].retailCatalogImageTitlesSource).toBe(true);

    const filtered = filterMetadataForShelfPlatform(
      {
        title: "Black Stories - Femmes Fatales",
        imageUrl: "/uploads/amc-sirenes.jpg",
        attachments,
      },
      { type: "boardgames", name: "Jeux de société" },
    );

    expect(filtered?.attachments?.map((attachment) => attachment.url)).toEqual([
      "/uploads/philibert-femmes-fatales.jpg",
    ]);
    expect(filtered?.imageUrl).toBe("/uploads/philibert-femmes-fatales.jpg");
  });

  it("filtre Sirènes via formatMetadataFromStorage + presentItemFromStorage", () => {
    const formatted = formatMetadataFromStorage({
      id: "meta-bs-ff",
      title: "Black Stories - Femmes Fatales",
      description: null,
      duration: null,
      pageCount: null,
      tracksCount: null,
      releaseDate: null,
      imageUrl: "/uploads/amc-sirenes.jpg",
      heroImageUrl: null,
      aliases: null,
      facts: null,
      sourceType: "boardgames",
      sourceQuery: "",
      lastFetched: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      attachments: [
        {
          id: "att-amc",
          metadataId: "meta-bs-ff",
          type: "cover",
          url: "/uploads/amc-sirenes.jpg",
          source: "achatmoinscher",
          title: "Sirènes : femmes fatales",
          duration: null,
          role: "fr",
          coverProvenance: null,
platformKey: null,
          width: null,
          height: null,
          meanLuminance: null,
          darkPixelRatio: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          id: "att-philibert",
          metadataId: "meta-bs-ff",
          type: "cover",
          url: "/uploads/philibert-femmes-fatales.jpg",
          source: "philibert",
          title: "Black Stories Femmes Fatales",
          duration: null,
          role: "fr",
          coverProvenance: null,
platformKey: null,
          width: null,
          height: null,
          meanLuminance: null,
          darkPixelRatio: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });

    const presented = presentItemFromStorage({
      id: "item-bs-ff",
      name: "Black Stories Femmes Fatales",
      imageUrl: "/uploads/amc-sirenes.jpg",
      metadata: formatted,
      shelf: { type: "boardgames", name: "Jeux de société" },
    });

    expect(presented.imageUrl).toBe("/uploads/philibert-femmes-fatales.jpg");
    expect(presented.metadata?.attachments?.map((a) => a.url)).toEqual([
      "/uploads/philibert-femmes-fatales.jpg",
    ]);
  });
});

describe("presentItem", () => {
  it("keeps the collector title and applies cover across the payload", () => {
    const presented = presentItem({
      name: "Super Monkey Ball Banana Blitz Complet VF",
      imageUrl: null,
      metadata: {
        title: "Super Monkey Ball: Banana Blitz",
        imageUrl: "/uploads/cover.jpg",
      },
      shelf: { type: "games" },
    });

    expect(presented.name).toBe("Super Monkey Ball Banana Blitz Complet VF");
    expect(presented.storedName).toBeUndefined();
    expect(presented.metadata?.title).toBe("Super Monkey Ball: Banana Blitz");
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

  it("prefers the collector name over metadata title", () => {
    expect(
      getDisplayTitle({
        name: "Alice 19th Tome 2",
        metadata: { title: "L'Académie Alice, tome 2" },
      }),
    ).toBe("Alice 19th Tome 2");
  });

  it("falls back to metadata title when the item has no name", () => {
    expect(
      getDisplayTitle({
        name: "",
        metadata: { title: "Mon jeu" },
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
platformKey: null,
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
platformKey: null,
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

  it("keeps the catalog metadata.title when it differs from the item name", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const presented = presentItemFromStorage({
      id: "item-wrc-4",
      name: "WRC 4: FIA World Rally Championship",
      imageUrl: "/uploads/wrc.jpg",
      shelf: { type: "games", name: "PlayStation Vita" },
      metadata: {
        id: "meta-wrc-4",
        title: "Wrc 4",
        description: null,
        releaseDate: null,
        imageUrl: "/uploads/wrc.jpg",
        heroImageUrl: null,
        duration: null,
        pageCount: null,
        tracksCount: null,
        aliases: null,
        facts: null,
        sourceType: "games",
        sourceQuery: "WRC 4",
        lastFetched: now,
        createdAt: now,
        updatedAt: now,
        authors: [],
        publishers: [],
        attachments: [],
      },
    } as Parameters<typeof presentItemFromStorage>[0]);

    expect(presented.name).toBe("WRC 4: FIA World Rally Championship");
    expect(presented.metadata?.title).toBe("Wrc 4");
  });

  it("aligns shelf list cover with detail when a stale item.imageUrl conflicts", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const presented = presentItemFromStorage({
      id: "item-tresors-1",
      name: "Les Trésors de Picsou n°1",
      imageUrl: "/uploads/ages-or-crop.jpg",
      metadata: {
        id: "meta-tresors-1",
        title: "Les Trésors de Picsou n°1",
        description: null,
        releaseDate: null,
        imageUrl: "/uploads/ages-or.jpg",
        heroImageUrl: null,
        duration: null,
        pageCount: null,
        tracksCount: null,
        aliases: null,
        facts: null,
        sourceType: "books",
        sourceQuery: "Les Trésors de Picsou n°1",
        lastFetched: now,
        createdAt: now,
        updatedAt: now,
        authors: [],
        publishers: [],
        attachments: [
          {
            id: "att-ages-or",
            metadataId: "meta-tresors-1",
            type: "cover",
            url: "/uploads/ages-or.jpg",
            title: "Les âges d'or de Picsou, Tome 1",
            source: "bdovore",
            role: null,
            duration: null,
            coverProvenance: null,
            platformKey: null,
            width: 400,
            height: 600,
            meanLuminance: 0.5,
            darkPixelRatio: 0.1,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "att-tresors",
            metadataId: "meta-tresors-1",
            type: "cover",
            url: "/uploads/tresors.jpg",
            title: "Les trésors de Picsou n°1 : La jeunesse de Picsou",
            source: "bdovore",
            role: null,
            duration: null,
            coverProvenance: null,
            platformKey: null,
            width: 420,
            height: 620,
            meanLuminance: 0.52,
            darkPixelRatio: 0.1,
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
      shelf: { type: "books", name: "Les Trésors de Picsou" },
    });

    expect(presented.metadata?.attachments?.map((attachment) => attachment.url)).toEqual([
      "/uploads/tresors.jpg",
    ]);
    expect(presented.imageUrl).toBe("/uploads/tresors.jpg");
    expect(presented.imageUrl).not.toBe("/uploads/ages-or-crop.jpg");
  });
});

describe("collapseCroppedUserPinWithCatalogOriginal", () => {
  it("folds Perso crop + remote jaquette into one catalog-provenance card", () => {
    const crop = "/uploads/81643a5c96dc4d6f01d8dc468a9c6d17_crop.jpg";
    const remote =
      "https://www.netgamesretro.com/28634-large_default/console-nintendo-gamecube-silver.jpg";

    const collapsed = collapseCroppedUserPinWithCatalogOriginal(
      [
        {
          type: "image",
          url: crop,
          source: "user",
        },
        {
          type: "cover",
          url: remote,
          source: "netgamesretro",
          providerLabel: "NetGamesRetro",
        },
      ],
      crop,
    );

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]).toMatchObject({
      url: crop,
      type: "cover",
      source: "netgamesretro",
      providerLabel: "NetGamesRetro",
    });
  });

  it("keeps distinct remote covers when more than one catalog jaquette exists", () => {
    const crop = "/uploads/pin_crop.jpg";
    const list = collapseCroppedUserPinWithCatalogOriginal(
      [
        { type: "image", url: crop, source: "user" },
        {
          type: "cover",
          url: "https://cdn.example.com/a.jpg",
          source: "ebay",
        },
        {
          type: "cover",
          url: "https://cdn.example.com/b.jpg",
          source: "pricecharting",
        },
      ],
      crop,
    );
    expect(list).toHaveLength(3);
  });

  it("folds Perso onto the metadata default among several remote covers", () => {
    const crop = "/uploads/da99c92ff8141242c04338d2cddcc64a_crop.jpg";
    const main =
      "https://storage.googleapis.com/images.pricecharting.com/labbsm5tagjpm2lr/1600.jpg";
    const collapsed = collapseCroppedUserPinWithCatalogOriginal(
      [
        { type: "image", url: crop, source: "user" },
        {
          type: "cover",
          url: main,
          source: "pricecharting",
          title: "Main Image",
          providerLabel: "PriceCharting",
        },
        {
          type: "cover",
          url: "https://storage.googleapis.com/images.pricecharting.com/other/1600.jpg",
          source: "pricecharting",
          title: "FRONT OF BOX",
        },
      ],
      crop,
      { metadataImageUrl: main },
    );

    expect(collapsed.map((attachment) => attachment.source)).toEqual([
      "pricecharting",
      "pricecharting",
    ]);
    expect(collapsed[0]).toMatchObject({
      url: crop,
      source: "pricecharting",
      title: "Main Image",
      providerLabel: "PriceCharting",
    });
  });

  it("does not fold an explicit post-enrichment personal pick onto catalog art", () => {
    const crop = "/uploads/my-disc_crop.jpg";
    const main = "https://cdn.example.com/main.jpg";
    const list = collapseCroppedUserPinWithCatalogOriginal(
      [
        { type: "image", url: crop, source: "user" },
        { type: "cover", url: main, source: "pricecharting" },
      ],
      crop,
      { metadataImageUrl: main, preserveExplicitUserOverride: true },
    );
    expect(list).toHaveLength(2);
    expect(list[0]?.source).toBe("user");
  });
});

describe("mergeCoverAttachmentsForPicker Perso/jaquette twin", () => {
  it("does not show Perso and Jaquette for the same cropped NetGamesRetro cover", () => {
    const crop = "/uploads/gamecube_crop.jpg";
    const remote =
      "https://www.netgamesretro.com/28634-large_default/console-nintendo-gamecube-silver.jpg";

    const picker = mergeCoverAttachmentsForPicker(
      {
        imageUrl: crop,
        metadata: {
          imageUrl: remote,
          attachments: [
            { type: "image", url: crop, source: "user" },
            {
              type: "cover",
              url: remote,
              source: "netgamesretro",
              providerLabel: "NetGamesRetro",
            },
          ],
        },
        shelf: { type: "hardware", name: "Consoles" },
      },
      [
        { type: "image", url: crop, source: "user" },
        {
          type: "cover",
          url: remote,
          source: "netgamesretro",
          providerLabel: "NetGamesRetro",
        },
      ],
      "fr",
    );

    expect(picker.filter((a) => a.type === "cover" || a.type === "image")).toHaveLength(
      1,
    );
    expect(picker[0]?.source).toBe("netgamesretro");
    expect(picker[0]?.url).toBe(crop);
  });
});
