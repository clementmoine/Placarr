import { describe, expect, it } from "vitest";

import {
  metadataResultsNeedGalleryEnrichment,
  metadataResultsHaveGameGallerySource,
} from "./galleryEnrichment";

describe("metadataResultsNeedGalleryEnrichment", () => {
  it("keeps chasing providers while only a single listing thumb exists", () => {
    expect(
      metadataResultsNeedGalleryEnrichment(
        "games",
        [
          {
            title: "Pack",
            imageUrl: "https://example.test/thumb.jpg",
            attachments: [
              { type: "cover", url: "https://example.test/thumb.jpg" },
            ],
          },
        ],
        "712725024789",
      ),
    ).toBe(true);
  });

  it("stops once a game-media gallery source contributed images", () => {
    expect(
      metadataResultsNeedGalleryEnrichment(
        "games",
        [
          {
            title: "Pack",
            attachments: [
              {
                type: "screenshot",
                url: "https://example.test/shot.jpg",
                source: "screenscraper",
              },
            ],
          },
        ],
        "712725024789",
      ),
    ).toBe(false);
    expect(
      metadataResultsHaveGameGallerySource([
        {
          attachments: [
            {
              type: "screenshot",
              url: "https://example.test/shot.jpg",
              source: "screenscraper",
            },
          ],
        },
      ]),
    ).toBe(true);
  });
});

describe("metadataResultsNeedGalleryEnrichment for books", () => {
  it("keeps chasing retailer galleries while only catalog covers exist", () => {
    expect(
      metadataResultsNeedGalleryEnrichment(
        "books",
        [
          {
            title: "Arcane",
            attachments: [
              {
                type: "cover",
                url: "https://cdn1.booknode.com/book_cover/full.jpg",
                source: "booknode",
              },
            ],
          },
        ],
        "9791035505677",
      ),
    ).toBe(true);
  });

  it("stops once a book gallery source contributed images", () => {
    expect(
      metadataResultsNeedGalleryEnrichment(
        "books",
        [
          {
            title: "Arcane",
            attachments: [
              {
                type: "screenshot",
                url: "https://chocobonplan.com/wp-content/uploads/screen.jpg",
                source: "chocobonplan",
              },
            ],
          },
        ],
        "9791035505677",
      ),
    ).toBe(false);
  });
});
