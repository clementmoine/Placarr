import { describe, expect, it } from "vitest";

import {
  explainAttachmentScoreForDisplay,
  pickBestCoverFromAttachments,
  rankAttachmentsForDisplay,
} from "./attachmentDisplayScore";

describe("attachmentDisplayScore", () => {
  it("priorise les covers ScreenScraper, qui sont des scans de vraies boîtes", () => {
    const steamGridCover = {
      type: "cover" as const,
      source: "steamgriddb",
      role: "grid-vertical",
      url: "/uploads/steamgrid.png",
    };
    const screenScraperCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "uk",
      url: "/uploads/screenscraper.jpg",
    };
    const metrics = new Map([
      [steamGridCover.url, { width: 600, height: 900, format: "png" }],
      [screenScraperCover.url, { width: 486, height: 606, format: "jpg" }],
    ]);

    expect(
      rankAttachmentsForDisplay(
        [steamGridCover, screenScraperCover],
        metrics,
      )[0],
    ).toBe(screenScraperCover);
  });

  it("documente le bonus de source vraie boîte pour ScreenScraper", () => {
    const details = explainAttachmentScoreForDisplay({
      type: "cover",
      source: "screenscraper",
      url: "/uploads/cover.jpg",
    });

    expect(details.signals).toContain("+220 real box cover source");
  });

  it("priorise une cover FR locale même si une cover EU a une meilleure résolution", () => {
    const metrics = new Map([
      [
        "/uploads/eu-hires.jpg",
        { width: 754, height: 1355, format: "jpeg" },
      ],
      ["/uploads/fr-small.jpg", { width: 312, height: 822, format: "jpeg" }],
    ]);

    expect(
      pickBestCoverFromAttachments(
        [
          {
            type: "cover",
            source: "bgg",
            role: "eu",
            url: "/uploads/eu-hires.jpg",
          },
          {
            type: "cover",
            source: "bgg",
            role: "fr",
            url: "/uploads/fr-small.jpg",
          },
        ],
        metrics,
      ),
    ).toBe("/uploads/fr-small.jpg");
  });

  it("ignore le disque ScreenScraper quand aucune jaquette boîte FR n'existe", () => {
    const metrics = new Map([
      [
        "/uploads/disc.jpg",
        { width: 1200, height: 1200, format: "jpeg" },
      ],
      ["/uploads/box-eu.jpg", { width: 754, height: 1355, format: "jpeg" }],
    ]);

    expect(
      pickBestCoverFromAttachments(
        [
          {
            type: "image",
            source: "screenscraper",
            role: "disc-fr",
            url: "/uploads/disc.jpg",
          },
          {
            type: "cover",
            source: "screenscraper",
            role: "eu",
            url: "/uploads/box-eu.jpg",
          },
        ],
        metrics,
      ),
    ).toBe("/uploads/box-eu.jpg");
  });
});
