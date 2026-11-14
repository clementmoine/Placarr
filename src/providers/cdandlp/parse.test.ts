import { describe, expect, it } from "vitest";

import {
  cdandlpHitMatchesType,
  cleanListingTitle,
  isCdandlpBlockedHtml,
  parseCdandlpProductPage,
  parseCdandlpSearchHits,
  pickBestCdandlpHit,
  upgradeCdandlpImageUrl,
} from "./parse";

const SEARCH_HTML = `
<html><body>
<div class="div_item_listing">
  <a href="https://www.cdandlp.com/en/walt-disney-toy-story/toy-story-ld-laserdisc-france/laser-disc/r118938116/">
    <img src="https://img.cdandlp.com/2017/09/imgM/118938116.jpg"
      alt="WALT DISNEY - TOY STORY - Toy story LD laserdisc france - Laser Disc" />
  </a>
</div>
<div class="div_item_listing">
  <a href="https://www.cdandlp.com/en/some-artist/some-album/lp/r999001/">
    <img src="https://img.cdandlp.com/2020/01/imgM/999001.jpg" alt="Some Artist - Some Album - LP" />
  </a>
</div>
</body></html>
`;

const PRODUCT_HTML = `
<html><head>
<meta property="og:title" content="Toy story ld laserdisc france - Walt Disney - Toy Story" />
<meta property="og:image" content="https://img.cdandlp.com/2017/09/imgL/118938116.jpg" />
<meta property="og:url" content="https://www.cdandlp.com/walt-disney-toy-story/toy-story-ld-laserdisc-france/laser-disc/r118938116/" />
<script type="application/ld+json">
{
  "@context":"https://schema.org",
  "@type":"Product",
  "name":"Walt Disney - Toy story – Toy story LD laserdisc france (Laser Disc)",
  "url":"https://www.cdandlp.com/walt-disney-toy-story/toy-story-ld-laserdisc-france/laser-disc/r118938116/",
  "description":"Laser Disc Walt Disney - Toy Story Toy story ld laserdisc france, pressage 3459370676105 - France, état disque M, état pochette M, vendu par roustaboutman sur CDandLP",
  "brand":{"@type":"Brand","name":"Walt disney home video"},
  "sku":"118938116",
  "image":["https://img.cdandlp.com/2017/09/imgL/118938116.jpg"],
  "additionalProperty":[
    {"@type":"PropertyValue","name":"Pressage","value":"3459370676105 - France"},
    {"@type":"PropertyValue","name":"Etat pochette","value":"M"}
  ],
  "offers":{
    "@type":"Offer",
    "priceCurrency":"EUR",
    "price":"25.00",
    "availability":"https://schema.org/InStock"
  }
}
</script>
</head><body></body></html>
`;

describe("isCdandlpBlockedHtml", () => {
  it("detects challenge pages", () => {
    expect(isCdandlpBlockedHtml("<title>Just a moment...</title>")).toBe(true);
    expect(isCdandlpBlockedHtml(SEARCH_HTML)).toBe(false);
  });
});

describe("upgradeCdandlpImageUrl", () => {
  it("promotes listing thumbs to large photos", () => {
    expect(
      upgradeCdandlpImageUrl("https://img.cdandlp.com/2017/09/imgM/118938116.jpg"),
    ).toBe("https://img.cdandlp.com/2017/09/imgL/118938116.jpg");
  });
});

describe("cleanListingTitle", () => {
  it("keeps the work title from artist + marketplace slug", () => {
    expect(
      cleanListingTitle(
        "Walt Disney - Toy story – Toy story LD laserdisc france (Laser Disc)",
      ),
    ).toBe("Toy story");
  });
});

describe("parseCdandlpSearchHits", () => {
  it("extracts format slug, title and upgraded thumb", () => {
    const hits = parseCdandlpSearchHits(SEARCH_HTML);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({
      id: "118938116",
      formatSlug: "laser-disc",
      formatLabel: "Laser Disc",
      url: "https://www.cdandlp.com/walt-disney-toy-story/toy-story-ld-laserdisc-france/laser-disc/r118938116/",
      thumbUrl: "https://img.cdandlp.com/2017/09/imgL/118938116.jpg",
    });
    expect(hits[0]?.title.toLowerCase()).toContain("toy story");
  });
});

describe("pickBestCdandlpHit / type gate", () => {
  it("keeps laser-disc for movies and excludes it for musics", () => {
    const hits = parseCdandlpSearchHits(SEARCH_HTML);
    expect(pickBestCdandlpHit(hits, "3459370676105", "movies")?.id).toBe(
      "118938116",
    );
    expect(pickBestCdandlpHit(hits, "Some Album", "musics")?.id).toBe(
      "999001",
    );
    expect(cdandlpHitMatchesType("laser-disc", "movies")).toBe(true);
    expect(cdandlpHitMatchesType("laser-disc", "musics")).toBe(false);
    expect(cdandlpHitMatchesType("lp", "musics")).toBe(true);
  });
});

describe("parseCdandlpProductPage", () => {
  it("reads title, barcode, cover, price and country from JSON-LD", () => {
    const listing = parseCdandlpProductPage(
      PRODUCT_HTML,
      "https://www.cdandlp.com/walt-disney-toy-story/toy-story-ld-laserdisc-france/laser-disc/r118938116/",
    );
    expect(listing).toMatchObject({
      id: "118938116",
      formatSlug: "laser-disc",
      formatLabel: "Laser Disc",
      title: "Toy story",
      barcode: "3459370676105",
      country: "France",
      publisher: "Walt disney home video",
      priceEur: 25,
      imageUrl: "https://img.cdandlp.com/2017/09/imgL/118938116.jpg",
    });
  });
});
