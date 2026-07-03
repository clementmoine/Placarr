import { describe, expect, it } from "vitest";

import {
  barcodesEquivalent,
  barcodeSearchNeedles,
  findVideoGameItemUrlInSitemapXml,
  parseEstimatedValueCents,
  parseICollectVideoGameItemPage,
  parseVideoGameSitemapUrls,
} from "./fetch";

const MARIO_KART_ITEM_HTML = `
<html>
  <head>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Thing","name":"Mario Kart Wii","url":"https://www.icollecteverything.com/db/item/videogame/892033/","image":"https://www.icollecteverything.com/images/videogame/main/89/892033_1.jpg","brand":{"@type":"Brand","name":"Nintendo"},"gtin13":"045496365226","additionalProperty":[{"@type":"PropertyValue","name":"Series","value":"Mario Kart"},{"@type":"PropertyValue","name":"Rating","value":"3+"},{"@type":"PropertyValue","name":"IGN Score","value":"8,5"},{"@type":"PropertyValue","name":"Release Date","value":"2008-11-04"},{"@type":"PropertyValue","name":"Game Summary","value":"Eccedingly a blast"},{"@type":"PropertyValue","name":"Platform","value":"Nintendo Wii"},{"@type":"PropertyValue","name":"Publisher","value":"Nintendo"},{"@type":"PropertyValue","name":"Players","value":"4"},{"@type":"PropertyValue","name":"Automatic Estimated Value","value":"en_FR 1875"},{"@type":"PropertyValue","name":"Automatic Estimated Date","value":"2026-05-30"}]}]}</script>
  </head>
  <body>
    <img class="mainimages" src="https://www.icollecteverything.com/images/videogame/main/89/892033_1.jpg" alt="Mario Kart Wii - Main Image 1" />
    <img class="mainimages" src="https://www.icollecteverything.com/images/videogame/main/89/892033_2.jpg" alt="Mario Kart Wii - Main Image 2" />
    <h1 class="important_value">Mario Kart Wii</h1>
    <div class="field-entry" data-field-key="barcode"><div class="attribute">Barcode:</div><div class="value">045496365226</div></div>
    <div class="field-entry" data-field-key="country"><div class="attribute">Country of Purchase:</div><div class="value">France</div></div>
    <div class="field-entry" data-field-key="automatic_estimated_value"><div class="attribute">Automatic Estimated Value:</div><div class="value">~€18.75</div></div>
    <div class="field-entry" data-field-key="genre"><div class="many_values"><div class="one_value">Racing</div></div></div>
  </body>
</html>
`;

const SITEMAP_SNIPPET = `
<url>
  <loc>https://www.icollecteverything.com/db/item/videogame/892033/</loc>
  <image:image>
    <image:loc>https://www.icollecteverything.com/images/videogame/main/89/892033_1.jpg</image:loc>
    <image:caption>Mario Kart Wii video game collectible [Barcode 045496365226] - Main Image 1</image:caption>
  </image:image>
</url>
`;

describe("icollect barcode helpers", () => {
  it("normalizes equivalent barcodes with different leading zeros", () => {
    expect(barcodesEquivalent("0045496365226", "045496365226")).toBe(true);
    expect(barcodesEquivalent("45496365226", "045496365226")).toBe(true);
    expect(barcodesEquivalent("0045496365226", "0045496364649")).toBe(false);
  });

  it("builds search needles for sitemap lookup", () => {
    expect(barcodeSearchNeedles("0045496365226")).toEqual(
      expect.arrayContaining(["0045496365226", "45496365226", "045496365226"]),
    );
  });
});

describe("parseEstimatedValueCents", () => {
  it("parses structured estimated value payloads", () => {
    expect(parseEstimatedValueCents("en_FR 1875")).toBe(1875);
    expect(parseEstimatedValueCents("~€18.75")).toBe(1875);
  });
});

describe("findVideoGameItemUrlInSitemapXml", () => {
  it("resolves the item URL from a sitemap barcode caption", () => {
    expect(
      findVideoGameItemUrlInSitemapXml(SITEMAP_SNIPPET, "0045496365226"),
    ).toBe("https://www.icollecteverything.com/db/item/videogame/892033/");
  });
});

describe("parseVideoGameSitemapUrls", () => {
  it("lists videogame sitemap URLs from the master index", () => {
    const urls = parseVideoGameSitemapUrls(`
      <urlset>
        <url><loc>https://www.icollecteverything.com/sitemaps/sitemap-videogames1.xml</loc></url>
        <url><loc>https://www.icollecteverything.com/sitemaps/sitemap-books1.xml</loc></url>
        <url><loc>https://www.icollecteverything.com/sitemaps/sitemap-videogames2.xml</loc></url>
      </urlset>
    `);
    expect(urls).toEqual([
      "https://www.icollecteverything.com/sitemaps/sitemap-videogames1.xml",
      "https://www.icollecteverything.com/sitemaps/sitemap-videogames2.xml",
    ]);
  });
});

const MX_VS_ATV_BROKEN_FIELDS_HTML = `
<html>
  <head>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Thing","name":"MX vs ATV : Extrême limite Xbox 360","gtin13":"4005209102735","additionalProperty":[{"@type":"PropertyValue","name":"Release Date","value":"1969-12-31"},{"@type":"PropertyValue","name":"Platform","value":"Microsoft Xbox 360"},{"@type":"PropertyValue","name":"Automatic Estimated Value","value":"en_FR 1758"},{"@type":"PropertyValue","name":"Automatic Estimated Date","value":"2025-05-25"}]}]}</script>
  </head>
  <body>
    <h1 class="important_value">MX vs ATV : Extrême limite Xbox 360</h1>
    <div class="field-entry" data-field-key="players"><div class="value">~€17.58</div></div>
    <div class="field-entry" data-field-key="rating"><div class="value">1969-12-31</div></div>
    <div class="field-entry" data-field-key="release_date"><div class="value">1969-12-31</div></div>
    <div class="field-entry" data-field-key="publisher"><div class="value">4005209102735</div></div>
    <div class="field-entry" data-field-key="automatic_estimated_value"><div class="value">~€17.58</div></div>
    <div class="field-entry" data-field-key="genre"><div class="many_values"><div class="one_value">Racing</div></div></div>
  </body>
</html>
`;

describe("parseICollectVideoGameItemPage", () => {
  it("extracts structured game metadata from JSON-LD and HTML", () => {
    const metadata = parseICollectVideoGameItemPage(
      MARIO_KART_ITEM_HTML,
      "https://www.icollecteverything.com/db/item/videogame/892033/",
    );

    expect(metadata).toMatchObject({
      itemId: "892033",
      title: "Mario Kart Wii",
      barcode: "045496365226",
      platform: "Nintendo Wii",
      publisher: "Nintendo",
      description: "Eccedingly a blast",
      releaseDate: "2008-11-04",
      players: "4",
      ageRating: "3+",
      ignScore: "8,5",
      series: "Mario Kart",
      countryOfPurchase: "France",
      estimatedValueCents: 1875,
      estimatedValueDate: "2026-05-30",
      coverUrl:
        "https://www.icollecteverything.com/images/videogame/main/89/892033_1.jpg",
    });
    expect(metadata?.images).toHaveLength(2);
    expect(metadata?.genres).toEqual(["Racing"]);
  });

  it("drops misaligned collector fields instead of emitting price/date as players/rating", () => {
    const metadata = parseICollectVideoGameItemPage(
      MX_VS_ATV_BROKEN_FIELDS_HTML,
      "https://www.icollecteverything.com/db/item/videogame/1553057/",
    );

    expect(metadata).toMatchObject({
      itemId: "1553057",
      title: "MX vs ATV : Extrême limite Xbox 360",
      barcode: "4005209102735",
      platform: "Microsoft Xbox 360",
      estimatedValueCents: 1758,
      estimatedValueDate: "2025-05-25",
      genres: ["Racing"],
      players: null,
      ageRating: null,
      releaseDate: null,
      publisher: null,
    });
  });
});
