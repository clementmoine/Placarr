import { describe, expect, it } from "vitest";

import { getGalleryImages, orderedCoverAttachmentsForDisplay } from "./media";

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
      orderedCoverAttachmentsForDisplay(item).map((attachment) => attachment.url),
    ).toEqual(["/uploads/b.jpg", "/uploads/a.jpg", "/uploads/c.jpg"]);
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
            title: "Metal Gear Solid Master Collection Volume 1 ps5 visuel produit",
            strictShelfPlatformCoverSource: true,
            retailCatalogImageTitlesSource: true,
          },
        ],
      },
      shelf: { type: "games", name: "PlayStation 4" },
    };

    expect(
      orderedCoverAttachmentsForDisplay(item).map((attachment) => attachment.url),
    ).toEqual(["/uploads/ps4-default.jpg"]);
  });

  it("hides Geedie covers without an explicit PS4 signal on a PS4 shelf", () => {
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
      orderedCoverAttachmentsForDisplay(item).map((attachment) => attachment.source),
    ).toEqual(["icollect"]);
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

    expect(getGalleryImages(item).slice(0, 3).map((image) => image.url)).toEqual([
      "/uploads/b.jpg",
      "/uploads/a.jpg",
      "/uploads/c.jpg",
    ]);
  });
});
