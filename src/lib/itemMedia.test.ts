import { describe, expect, it } from "vitest";

import { getCoverImage } from "./itemMedia";

describe("getCoverImage", () => {
  it("prefers true ScreenScraper box covers over IGDB covers for games", () => {
    expect(
      getCoverImage({
        shelf: { type: "games" },
        metadata: {
          attachments: [
            { type: "cover", source: "igdb", url: "igdb-cover" },
            {
              type: "cover",
              source: "screenscraper",
              role: "eu",
              url: "screenscraper-box",
            },
          ],
        },
      }),
    ).toBe("screenscraper-box");
  });

  it("does not prefer ScreenScraper mix images over real IGDB covers", () => {
    expect(
      getCoverImage({
        shelf: { type: "games" },
        metadata: {
          attachments: [
            {
              type: "cover",
              source: "screenscraper",
              role: "eu-mixrbv2",
              url: "screenscraper-mix",
            },
            { type: "cover", source: "igdb", url: "igdb-cover" },
          ],
        },
      }),
    ).toBe("igdb-cover");
  });

  it("prefers The Cover Project physical covers over digital artwork fallbacks", () => {
    expect(
      getCoverImage({
        shelf: { type: "games" },
        metadata: {
          attachments: [
            { type: "cover", source: "steamgriddb", url: "steamgrid-cover" },
            { type: "cover", source: "igdb", url: "igdb-cover" },
            {
              type: "cover",
              source: "coverproject",
              url: "coverproject-cover",
            },
          ],
        },
      }),
    ).toBe("coverproject-cover");
  });

  it("prefers The Cover Project covers over ScreenScraper mix images", () => {
    expect(
      getCoverImage({
        shelf: { type: "games" },
        metadata: {
          attachments: [
            {
              type: "cover",
              source: "screenscraper",
              role: "eu-mixrbv2",
              url: "screenscraper-mix",
            },
            {
              type: "cover",
              source: "coverproject",
              url: "coverproject-cover",
            },
          ],
        },
      }),
    ).toBe("coverproject-cover");
  });

  // Format boîte SteamGridDB (grille verticale) — cas Wheelman.
  it("prefers a SteamGridDB vertical grid (box) over a digital IGDB cover", () => {
    expect(
      getCoverImage({
        shelf: { type: "games" },
        metadata: {
          attachments: [
            { type: "cover", source: "igdb", url: "igdb-cover" },
            {
              type: "cover",
              source: "steamgriddb",
              role: "grid-vertical",
              url: "sgdb-box",
            },
          ],
        },
      }),
    ).toBe("sgdb-box");
  });

  it("prefers a SteamGridDB vertical grid over a ScreenScraper box-3D render", () => {
    expect(
      getCoverImage({
        shelf: { type: "games" },
        metadata: {
          attachments: [
            {
              type: "cover",
              source: "screenscraper",
              role: "eu-3d",
              url: "ss-3d",
            },
            {
              type: "cover",
              source: "steamgriddb",
              role: "grid-vertical",
              url: "sgdb-box",
            },
          ],
        },
      }),
    ).toBe("sgdb-box");
  });

  it("still prefers a real ScreenScraper box-2D over a SteamGridDB grid", () => {
    expect(
      getCoverImage({
        shelf: { type: "games" },
        metadata: {
          attachments: [
            {
              type: "cover",
              source: "steamgriddb",
              role: "grid-vertical",
              url: "sgdb-box",
            },
            {
              type: "cover",
              source: "screenscraper",
              role: "eu",
              url: "ss-box",
            },
          ],
        },
      }),
    ).toBe("ss-box");
  });

  it("does not let a SteamGridDB horizontal grid beat a digital IGDB cover", () => {
    expect(
      getCoverImage({
        shelf: { type: "games" },
        metadata: {
          attachments: [
            { type: "cover", source: "igdb", url: "igdb-cover" },
            {
              type: "cover",
              source: "steamgriddb",
              role: "grid-horizontal",
              url: "sgdb-wide",
            },
          ],
        },
      }),
    ).toBe("igdb-cover");
  });
});
