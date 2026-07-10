import { describe, expect, it } from "vitest";

import {
  resolveGameAttachmentPlatformKey,
  solePlatformKeyFromNames,
  stampAttachmentPlatformKeys,
  withMetadataPlatformKeys,
} from "./platformKeyStamp";

describe("platformKeyStamp", () => {
  it("stamps attachments without overwriting an existing platformKey", () => {
    const attachments = stampAttachmentPlatformKeys(
      [
        { type: "cover", url: "/a.jpg", source: "screenscraper" },
        {
          type: "cover",
          url: "/b.jpg",
          source: "screenscraper",
          platformKey: "ps3",
        },
      ],
      "psvita",
    );

    expect(attachments).toEqual([
      {
        type: "cover",
        url: "/a.jpg",
        source: "screenscraper",
        platformKey: "psvita",
      },
      {
        type: "cover",
        url: "/b.jpg",
        source: "screenscraper",
        platformKey: "ps3",
      },
    ]);
  });

  it("propagates metadata.platformKey onto attachments", () => {
    const metadata = withMetadataPlatformKeys({
      title: "Game",
      platformKey: "psvita",
      attachments: [{ type: "cover", url: "/cover.jpg", source: "launchbox" }],
    });

    expect(metadata.attachments?.[0]?.platformKey).toBe("psvita");
  });

  it("prefers an explicit requested platform when title is ambiguous", () => {
    expect(
      resolveGameAttachmentPlatformKey({
        requestedPlatform: "psvita",
        title: "Angry Birds Star Wars",
      }),
    ).toBe("psvita");
  });

  it("prefers product URL platform over shelf context", () => {
    expect(
      resolveGameAttachmentPlatformKey({
        shelfName: "PlayStation Vita",
        title: "Angry Birds Star Wars",
        productUrl:
          "https://www.netgamesretro.com/fr/jeux-video-netgamesretrocom/123-angry-birds-star-wars-wii.html",
      }),
    ).toBe("wii");
  });

  it("does not inherit shelf platform when retailer product signals are ambiguous", () => {
    expect(
      resolveGameAttachmentPlatformKey({
        shelfName: "PlayStation Vita",
        title: "Sonic & All-Stars Racing Transformed",
        productUrl:
          "https://www.netgamesretro.com/fr/jeux-video-netgamesretrocom/123-sonic.html",
      }),
    ).toBeUndefined();
  });

  it("reads platform from retailer image URL when product slug is ambiguous", () => {
    expect(
      resolveGameAttachmentPlatformKey({
        title: "Sonic & All-Stars Racing Transformed",
        productUrl:
          "https://www.netgamesretro.com/fr/jeux-video-netgamesretrocom/123-sonic.html",
        imageUrl:
          "https://www.netgamesretro.com/17755-large_default/sonic-nintendo-3ds.jpg",
      }),
    ).toBe("3ds");
  });

  it("prefers product title platform over shelf context", () => {
    expect(
      resolveGameAttachmentPlatformKey({
        requestedPlatform: "psvita",
        title: "Angry Birds Star Wars Wii",
      }),
    ).toBe("wii");
  });

  it("reads platform from product title when request context is absent", () => {
    expect(
      resolveGameAttachmentPlatformKey({
        title: "Metal Gear Solid PS4",
      }),
    ).toBe("ps4");
  });

  it("returns a key only when platform names are unambiguous", () => {
    expect(
      solePlatformKeyFromNames(["PlayStation Vita", "PS Vita"]),
    ).toBe("psvita");
    expect(
      solePlatformKeyFromNames(["PlayStation 4", "PlayStation Vita"]),
    ).toBeUndefined();
  });
});
