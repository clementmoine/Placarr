import { describe, expect, it } from "vitest";

import {
  createScreenScraperResolver,
  pickSSCover,
  type SSMedia,
} from "./screenScraperProvider";

describe("pickSSCover", () => {
  it("prefers box-2D with region priority", () => {
    const medias: SSMedia[] = [
      { type: "box-3D", region: "us", url: "3d-us" },
      { type: "box-2D", region: "eu", url: "2d-eu" },
      { type: "box-2D", region: "fr", url: "2d-fr" },
    ];

    expect(pickSSCover(medias)).toBe("2d-fr");
  });

  it("falls back to any preferred type when region is missing", () => {
    const medias: SSMedia[] = [{ type: "box-3D", url: "3d-any" }];
    expect(pickSSCover(medias)).toBe("3d-any");
  });

  it("returns null when no supported cover type is available", () => {
    const medias: SSMedia[] = [{ type: "mixrbv2", region: "fr", url: "mix" }];
    expect(pickSSCover(medias)).toBeNull();
  });
});

describe("createScreenScraperResolver", () => {
  it("returns null when ScreenScraper is not configured", async () => {
    const previousDevId = process.env.SCREENSCRAPER_DEV_ID;
    const previousDevPass = process.env.SCREENSCRAPER_DEV_PASSWORD;
    delete process.env.SCREENSCRAPER_DEV_ID;
    delete process.env.SCREENSCRAPER_DEV_PASSWORD;

    try {
      const resolver = createScreenScraperResolver({
        cleanSearchQuery: (value) => value,
        formatScore: () => null,
      });
      const result = await resolver("Any Game");
      expect(result).toBeNull();
    } finally {
      if (previousDevId === undefined) {
        delete process.env.SCREENSCRAPER_DEV_ID;
      } else {
        process.env.SCREENSCRAPER_DEV_ID = previousDevId;
      }
      if (previousDevPass === undefined) {
        delete process.env.SCREENSCRAPER_DEV_PASSWORD;
      } else {
        process.env.SCREENSCRAPER_DEV_PASSWORD = previousDevPass;
      }
    }
  });
});
