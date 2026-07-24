import { describe, expect, it } from "vitest";

import { mapPrestashopMetadata } from "./resolver";

describe("mapPrestashopMetadata", () => {
  it("stamps platform from product URL instead of inheriting the shelf", () => {
    const metadata = mapPrestashopMetadata(
      {
        title: "Angry Birds Star Wars",
        productUrl:
          "https://www.netgamesretro.com/fr/jeux-video-netgamesretrocom/123-angry-birds-star-wars-wii.html",
        imageUrl:
          "https://www.netgamesretro.com/17755-large_default/angry-birds-star-wars.jpg",
        source: "netgamesretro",
      },
      "NetGamesRetro",
      [],
      { shelfName: "PlayStation Vita" },
    );

    expect(metadata.platformKey).toBe("wii");
    expect(metadata.attachments?.[0]?.platformKey).toBe("wii");
  });

  it("stamps 3DS from retailer image URL without inheriting the Vita shelf", () => {
    const metadata = mapPrestashopMetadata(
      {
        title: "Sonic & All-Stars Racing Transformed",
        productUrl:
          "https://www.netgamesretro.com/fr/jeux-video-netgamesretrocom/123-sonic.html",
        imageUrl:
          "https://www.netgamesretro.com/17755-large_default/sonic-nintendo-3ds.jpg",
        source: "netgamesretro",
      },
      "NetGamesRetro",
      [],
      { shelfName: "PlayStation Vita" },
    );

    expect(metadata.platformKey).toBe("3ds");
    expect(metadata.attachments?.[0]?.platformKey).toBe("3ds");
  });
});
