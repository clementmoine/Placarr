import { describe, expect, it } from "vitest";

import { extractBarcodeEntriesFromSitemapXml } from "./indexStore";

const SITEMAP_SNIPPET = `
<url>
  <loc>https://www.icollecteverything.com/db/item/videogame/892033/</loc>
  <image:image>
    <image:loc>https://www.icollecteverything.com/images/videogame/main/89/892033_1.jpg</image:loc>
    <image:caption>Mario Kart Wii video game collectible [Barcode 045496365226] - Main Image 1</image:caption>
  </image:image>
  <image:image>
    <image:loc>https://www.icollecteverything.com/images/videogame/main/89/892033_2.jpg</image:loc>
    <image:caption>Mario Kart Wii video game collectible [Barcode 045496365226] - Main Image 2</image:caption>
  </image:image>
</url>
<url>
  <loc>https://www.icollecteverything.com/db/item/videogame/892034/</loc>
  <image:image>
    <image:caption>Other Game [Barcode 0045496364649] - Main Image 1</image:caption>
  </image:image>
</url>
`;

describe("extractBarcodeEntriesFromSitemapXml", () => {
  it("indexes unique normalized barcodes per sitemap url block", () => {
    const entries = extractBarcodeEntriesFromSitemapXml(SITEMAP_SNIPPET);
    expect(entries).toEqual([
      {
        barcodeKey: "45496365226",
        rawBarcode: "045496365226",
        itemId: "892033",
        itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
      },
      {
        barcodeKey: "45496364649",
        rawBarcode: "0045496364649",
        itemId: "892034",
        itemUrl: "https://www.icollecteverything.com/db/item/videogame/892034/",
      },
    ]);
  });
});
