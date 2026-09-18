import { describe, expect, it } from "vitest";

import { hashKayouOfficialCatalog } from "./kayouOfficialCrawl";
import {
  parseKayouOfficialIpSeriesIndex,
  parseKayouOfficialProductSpecs,
  parseKayouOfficialSeriesCards,
  parseKayouOfficialSeriesDetail,
  parseNarutoKayouSeriesIds,
} from "./kayouOfficialParse";

const SAMPLE_HTML = String.raw`
"idCode\":\"NRCCNA-UR-001\",\"rarity\":\"UR\",\"backImage\":\"https://cdn.example/ur.png\"
"idCode\":\"NRCCNA-UR-002\",\"rarity\":\"UR\",\"backImage\":\"https://cdn.example/ur.png\"
"idCode\":\"NRCCNA-SSR-003\",\"rarity\":\"SSR\",\"backImage\":\"https://cdn.example/ssr.png\"
"idCode\":\"NRCCNA-◇XR-004\",\"rarity\":\"◇XR\",\"backImage\":\"https://cdn.example/shin-xr.png\"
`;

const FULL_MERCH_HTML = String.raw`
\"cards\":[{\"id\":\"merch-abc\",\"idCode\":\"NREA02-UR-015L3\",\"name\":\"Naruto Uzumaki\",\"rarity\":\"UR\",\"rarityFull\":\"Ultra Rare\",\"image\":\"https://cdn.example/front.png\",\"imageWidth\":733,\"imageHeight\":1029,\"backImage\":\"https://cdn.example/back.png\",\"sortOrder\":15}]
`;

describe("parseKayouOfficialSeriesCards", () => {
  it("extracts idCode, rarity, backImage from minimal RSC HTML", () => {
    const rows = parseKayouOfficialSeriesCards(SAMPLE_HTML);
    expect(rows).toEqual([
      {
        idCode: "NRCCNA-UR-001",
        name: "NRCCNA-UR-001",
        rarity: "UR",
        frontImage: "",
        backImage: "https://cdn.example/ur.png",
      },
      {
        idCode: "NRCCNA-UR-002",
        name: "NRCCNA-UR-002",
        rarity: "UR",
        frontImage: "",
        backImage: "https://cdn.example/ur.png",
      },
      {
        idCode: "NRCCNA-SSR-003",
        name: "NRCCNA-SSR-003",
        rarity: "SSR",
        frontImage: "",
        backImage: "https://cdn.example/ssr.png",
      },
      {
        idCode: "NRCCNA-◇XR-004",
        name: "NRCCNA-◇XR-004",
        rarity: "◇XR",
        frontImage: "",
        backImage: "https://cdn.example/shin-xr.png",
      },
    ]);
  });

  it("parses full merch gallery rows with face metadata", () => {
    const rows = parseKayouOfficialSeriesCards(FULL_MERCH_HTML);
    expect(rows).toEqual([
      {
        idCode: "NREA02-UR-015L3",
        name: "Naruto Uzumaki",
        rarity: "UR",
        rarityFull: "Ultra Rare",
        frontImage: "https://cdn.example/front.png",
        frontWidth: 733,
        frontHeight: 1029,
        backImage: "https://cdn.example/back.png",
        sortOrder: 15,
      },
    ]);
  });
});

describe("parseNarutoKayouSeriesIds", () => {
  it("reads Naruto series ids from ip-collections block", () => {
    const html = `prefix ip-rtqgm0xa suffix seriesId\\":\\"series-abc123\\",seriesId\\":\\"series-def456 next ip-zzzzzzzz`;
    expect(parseNarutoKayouSeriesIds(html)).toEqual([
      "series-abc123",
      "series-def456",
    ]);
  });
});

describe("parseKayouOfficialIpSeriesIndex", () => {
  it("pairs section eyebrow/title with series ids", () => {
    const html = String.raw`
ip-rtqgm0xa
\"eyebrow\":\"Smriti Collectible Cards\",\"title\":\"Earth Scroll\",\"seriesId\":\"series-8idoe481\"
\"eyebrow\":\"Smriti Collectible Cards\",\"title\":\"Heaven Scroll\",\"seriesId\":\"series-0nyket49\"
ip-other0000`;
    expect(parseKayouOfficialIpSeriesIndex(html)).toEqual([
      {
        ipId: "ip-rtqgm0xa",
        seriesId: "series-8idoe481",
        sectionEyebrow: "Smriti Collectible Cards",
        sectionTitle: "Earth Scroll",
      },
      {
        ipId: "ip-rtqgm0xa",
        seriesId: "series-0nyket49",
        sectionEyebrow: "Smriti Collectible Cards",
        sectionTitle: "Heaven Scroll",
      },
    ]);
  });
});

describe("parseKayouOfficialSeriesDetail", () => {
  it("collects SKU specs and cards on a series page", () => {
    const html = String.raw`
seriesTypeName\":\"Earth Scroll\",\"seriesTypeDescription\":\"Smriti Collectible Cards\"
heroBoxImage\":\"https://cdn.example/box.png\"
productSpecs\":[{\"label\":\"Product Name\",\"value\":\"NARUTO-Earth Scroll\"},{\"label\":\"Model\",\"value\":\"NR-KP-DZJ-002A-NA\"}],\"probabilities
${FULL_MERCH_HTML}`;
    const detail = parseKayouOfficialSeriesDetail(html, "series-8idoe481");
    expect(detail.seriesId).toBe("series-8idoe481");
    expect(detail.seriesTypeName).toBe("Earth Scroll");
    expect(detail.productName).toBe("NARUTO-Earth Scroll");
    expect(detail.model).toBe("NR-KP-DZJ-002A-NA");
    expect(detail.heroBoxImage).toBe("https://cdn.example/box.png");
    expect(detail.cards).toHaveLength(1);
  });
});

describe("parseKayouOfficialProductSpecs", () => {
  it("keeps known SKU labels only", () => {
    const html = String.raw`productSpecs\":[{\"label\":\"Product Name\",\"value\":\"Foo\"},{\"label\":\"Noise\",\"value\":\"skip\"}],\"probabilities`;
    expect(parseKayouOfficialProductSpecs(html)).toEqual({
      "Product Name": "Foo",
    });
  });
});

describe("hashKayouOfficialCatalog", () => {
  it("is stable for identical card sets", () => {
    const rows = [
      {
        seriesId: "series-a",
        cards: [
          {
            idCode: "A-001",
            name: "A",
            rarity: "R",
            frontImage: "https://f/a.png",
            backImage: "https://b/a.png",
          },
        ],
      },
    ];
    expect(hashKayouOfficialCatalog(rows)).toBe(hashKayouOfficialCatalog(rows));
  });

  it("changes when a card back URL changes", () => {
    const base = [
      {
        seriesId: "series-a",
        cards: [
          {
            idCode: "A-001",
            name: "A",
            rarity: "R",
            frontImage: "https://f/a.png",
            backImage: "https://b/a.png",
          },
        ],
      },
    ];
    const changed = [
      {
        seriesId: "series-a",
        cards: [
          {
            idCode: "A-001",
            name: "A",
            rarity: "R",
            frontImage: "https://f/a.png",
            backImage: "https://b/b.png",
          },
        ],
      },
    ];
    expect(hashKayouOfficialCatalog(base)).not.toBe(
      hashKayouOfficialCatalog(changed),
    );
  });
});
