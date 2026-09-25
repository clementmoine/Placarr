import { afterEach, describe, expect, it } from "vitest";
import { kayouFinishesForRarity, kayouShinyFinish } from "../finishes";
import {
  canonicalizeKayouNumber,
  canonicalizeKayouNumberForSet,
  kayouBoxToSetCode,
  kayouCleanPrintedId,
  kayouHitmarketFileToNumber,
  kayouHitmarketRelativePath,
  kayouOfficialIdSlug,
  kayouOfficialIdSuffixKeys,
  kayouOfficialIdToCcNumber,
  kayouOfficialIdToPrint,
  kayouOfficialLookupKeys,
  kayouPrintedToNumber,
} from "../identity";
import {
  parseKayouOfficialIpSeriesIndex,
  parseKayouOfficialProductSpecs,
  parseKayouOfficialSeriesCards,
  parseKayouOfficialSeriesDetail,
  parseNarutoKayouSeriesIds,
} from "./hosts";
import {
  __setKayouOfficialCardBackManifestForTests,
  buildKayouOfficialCardBackManifest,
  kayouBackTierSlug,
  kayouCardBackUrlForOfficialReference,
  kayouCardBackUrlForRarity,
  listKayouPerCardBackRows,
  pickKayouTierBacks,
  resetKayouOfficialCardBackManifestCache,
  type KayouOfficialCardBack,
} from "../sources/backs";
import { hashKayouOfficialCatalog } from "../sources/crawl";

// —— kayouOfficialParse ——
{
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
}

// —— kayouOfficialId ——
{
  describe("kayouOfficialIdSlug", () => {
    it("normalizes official id codes", () => {
      expect(kayouOfficialIdSlug("NREA02-UR-015L3")).toBe("nrea02-ur-015l3");
      expect(kayouOfficialIdSlug("NRI01-AR-006L4")).toBe("nri01-ar-006l4");
      expect(kayouOfficialIdSlug("NREA02-◇UR-001L3")).toBe("nrea02-shin-ur-001l3");
    });
  });

  describe("kayouOfficialIdToCcNumber", () => {
    it.each([
      ["NRCCNA-◇MR-001", "cc.mr.001s"],
      ["NRCCNA-◇MR-002", "cc.mr.002s"],
      ["NRCCNA-MR-001", "cc.mr.001"],
      ["NRCCNA-XR-001L5", "cc.xr.001l5"],
      ["NRCCNA-R-024", "cc.r.024"],
      ["NREA02-UR-015L3", null],
    ])("%s → %s", (id, want) => {
      expect(kayouOfficialIdToCcNumber(id)).toBe(want);
    });
  });

  describe("kayouOfficialIdToPrint", () => {
    it("maps Smriti product codes onto set + number", () => {
      expect(kayouOfficialIdToPrint("NREA01-SR-018L2")).toEqual({
        setCode: "nrea01",
        number: "nrea01.sr.018l2",
      });
      expect(kayouOfficialIdToPrint("NREA02-CR-001L5")).toEqual({
        setCode: "nrea02",
        number: "nrea02.cr.001l5",
      });
      expect(kayouOfficialIdToPrint("NRI01-SP-001L5")).toEqual({
        setCode: "nri01",
        number: "nri01.sp.001l5",
      });
      expect(kayouOfficialIdToPrint("NRSA02-◇ASP-001L5")).toEqual({
        setCode: "nrsa02",
        number: "nrsa02.asp.001l5s",
      });
      expect(kayouOfficialIdToPrint("NRCCNA-MR-001")).toEqual({
        setCode: "ninjaagebox",
        number: "cc.mr.001",
      });
    });
  });

  describe("kayouOfficialLookupKeys", () => {
    it("builds suffix keys from catalogue references", () => {
      expect(kayouOfficialLookupKeys("NREA02-UR-015L3", "UR")).toContain(
        "nrea02-ur-015l3",
      );
      expect(kayouOfficialLookupKeys("NR-UR-015", "UR")).toContain("ur-015");
    });
  });

  describe("kayouOfficialIdSuffixKeys", () => {
    it("extracts rarity-number suffix", () => {
      expect(kayouOfficialIdSuffixKeys("NREA02-UR-015L3")).toEqual([
        "ur-015l3",
        "nrea02-ur-015l3",
      ]);
    });
  });
}

// —— kayouIdNormalize ——
{
  describe("kayouIdNormalize", () => {
    it("maps CCG box labels to set codes", () => {
      expect(kayouBoxToSetCode("T4W8")).toBe("t4w8");
      expect(kayouBoxToSetCode("NinjaAge")).toBe("ninjaagebox");
      expect(kayouBoxToSetCode("Heaven&Earth")).toBe("smritiheavenscrolls1");
    });

    it("normalizes full Kayou printed ids", () => {
      expect(kayouPrintedToNumber("NRZ08-ASP-001")).toBe("nrz08.asp.001");
      expect(kayouPrintedToNumber("NR-R-001")).toBe("nr.r.001");
    });

    it("adds nr. prefix to box-scoped CCG ids", () => {
      expect(kayouPrintedToNumber("SP-002")).toBe("nr.sp.002");
      expect(kayouPrintedToNumber("UR-014")).toBe("nr.ur.014");
    });

    it("strips lenticular diamond entities", () => {
      expect(kayouCleanPrintedId("NRZ08-&#x25C7;ASP-001")).toBe("NRZ08-ASP-001");
    });

    it("reads hitmarket filenames with full prefixes", () => {
      expect(kayouHitmarketFileToNumber("NRSS-UR-001.webp")).toBe("nrss.ur.001");
      expect(kayouHitmarketFileToNumber("HR-1.webp")).toBeNull();
    });

    it("collapses CCG nr.ss / nr.cc onto narutocards forms", () => {
      expect(kayouPrintedToNumber("NR-SS-HR-011")).toBe("nrss.hr.011");
      expect(kayouPrintedToNumber("NR-CC-R-001")).toBe("cc.r.001");
      expect(canonicalizeKayouNumber("nr.ss.hr.002")).toBe("nrss.hr.002");
      expect(canonicalizeKayouNumber("nr.cc.mr.001s")).toBe("cc.mr.001s");
    });

    it("admits SLR+ as slrplus for printKey segments", () => {
      expect(canonicalizeKayouNumber("nr.slr+.001")).toBe("nr.slrplus.001");
    });

    it("maps short nr.* onto wave prefixes for twin sets", () => {
      expect(canonicalizeKayouNumberForSet("t2w7", "nr.cr.023")).toBe(
        "nrb07.cr.023",
      );
      expect(canonicalizeKayouNumberForSet("t4w6", "nr.bp.028")).toBe(
        "nrz06.bp.028",
      );
      expect(canonicalizeKayouNumberForSet("t1w1", "nr.r.001")).toBe("nr.r.001");
    });
  });
}

// —— kayouBackTier ——
{
  describe("kayouBackTierSlug", () => {
    it.each([
      ["R", "r"],
      ["UR", "ur"],
      ["SSR", "ssr"],
      ["HR", "hr"],
      ["MR", "mr"],
      ["BP", "bp"],
      ["◇XR", "shin-xr"],
      ["SHIN-XR", "shin-xr"],
      ["◇MR", "shin-mr"],
      ["", null],
      [null, null],
    ] as const)("maps %j → %j", (rarity, slug) => {
      expect(kayouBackTierSlug(rarity)).toBe(slug);
    });
  });

  describe("kayouCardBackUrlForRarity", () => {
    it("builds tier back asset URL", () => {
      expect(kayouCardBackUrlForRarity("naruto/kayou", "UR")).toBe(
        "/assets/naruto/kayou/cards/back.ur.webp",
      );
    });

    it("maps SSR/PTR onto the shared SR sleeve via aliases", () => {
      expect(kayouBackTierSlug("SSR")).toBe("ssr");
      expect(kayouCardBackUrlForRarity("naruto/kayou", "SSR")).toBe(
        "/assets/naruto/kayou/cards/back.sr.webp",
      );
      expect(kayouCardBackUrlForRarity("naruto/kayou", "PTR")).toBe(
        "/assets/naruto/kayou/cards/back.sr.webp",
      );
    });

    it("does not stamp R when it matches the pack default", () => {
      expect(kayouCardBackUrlForRarity("naruto/kayou", "R")).toBeNull();
    });

    it("returns null when rarity is empty", () => {
      expect(kayouCardBackUrlForRarity("naruto/kayou", "")).toBeNull();
    });
  });
}

// —— kayouOfficialBacks ——
{
  afterEach(() => {
    resetKayouOfficialCardBackManifestCache();
  });

  describe("pickKayouTierBacks", () => {
    it("groups by tier and picks majority URL on conflict", () => {
      const rows: KayouOfficialCardBack[] = [
        {
          idCode: "a",
          rarity: "UR",
          backImage: "https://cdn/ur-a.png",
          seriesId: "series-1",
        },
        {
          idCode: "b",
          rarity: "UR",
          backImage: "https://cdn/ur-a.png",
          seriesId: "series-1",
        },
        {
          idCode: "c",
          rarity: "UR",
          backImage: "https://cdn/ur-b.png",
          seriesId: "series-2",
        },
        {
          idCode: "d",
          rarity: "SSR",
          backImage: "https://cdn/ssr.png",
          seriesId: "series-1",
        },
      ];
      const picks = pickKayouTierBacks(rows);
      expect(picks).toEqual([
        {
          tier: "ssr",
          url: "https://cdn/ssr.png",
          votes: 1,
          seriesIds: ["series-1"],
          conflict: false,
        },
        {
          tier: "ur",
          url: "https://cdn/ur-a.png",
          votes: 2,
          seriesIds: ["series-1"],
          conflict: true,
        },
      ]);
    });
  });

  describe("listKayouPerCardBackRows", () => {
    it("flags series tiers with multiple distinct backs", () => {
      const rows: KayouOfficialCardBack[] = [
        {
          idCode: "NREA02-UR-001L3",
          rarity: "UR",
          backImage: "https://cdn/a.png",
          seriesId: "series-8idoe481",
        },
        {
          idCode: "NREA02-UR-015L3",
          rarity: "UR",
          backImage: "https://cdn/b.png",
          seriesId: "series-8idoe481",
        },
        {
          idCode: "NREA02-R-001L1",
          rarity: "R",
          backImage: "https://cdn/r.png",
          seriesId: "series-8idoe481",
        },
        {
          idCode: "NREA02-R-002L1",
          rarity: "R",
          backImage: "https://cdn/r.png",
          seriesId: "series-8idoe481",
        },
      ];
      const perCard = listKayouPerCardBackRows(rows);
      expect(perCard.map((r) => r.idCode).sort()).toEqual([
        "NREA02-UR-001L3",
        "NREA02-UR-015L3",
      ]);
    });
  });

  describe("kayouOfficialCardBackManifest", () => {
    it("resolves print placement to card-local back.webp", () => {
      __setKayouOfficialCardBackManifestForTests(
        buildKayouOfficialCardBackManifest(
          [
            {
              idCode: "NREA02-UR-015L3",
              url: "https://cdn/b.png",
              seriesId: "series-8idoe481",
              rarity: "UR",
              placement: {
                kind: "print",
                set: "nrea02",
                lang: "en",
                card: "nrea02.ur.015l3",
              },
            },
          ],
          { observed: "2026-08-28", seriesIds: ["series-8idoe481"] },
        ),
      );
      expect(
        kayouCardBackUrlForOfficialReference("NREA02-UR-015L3", "UR"),
      ).toBe(
        "/assets/naruto/kayou/cards/nrea02/en/nrea02.ur.015l3/back.webp",
      );
      expect(kayouCardBackUrlForOfficialReference("NR-UR-015L3", "UR")).toBe(
        "/assets/naruto/kayou/cards/nrea02/en/nrea02.ur.015l3/back.webp",
      );
    });

    it("resolves tier placement to pack back.<tier>.webp", () => {
      __setKayouOfficialCardBackManifestForTests(
        buildKayouOfficialCardBackManifest(
          [
            {
              idCode: "NREA02-UR-001L3",
              url: "https://cdn/a.png",
              seriesId: "series-8idoe481",
              rarity: "UR",
              placement: { kind: "tier", slug: "ur" },
            },
          ],
          { observed: "2026-08-28", seriesIds: ["series-8idoe481"] },
        ),
      );
      expect(
        kayouCardBackUrlForOfficialReference("NREA02-UR-001L3", "UR"),
      ).toBe("/assets/naruto/kayou/cards/back.ur.webp");
    });
  });
}

// —— finishes ——
{
  describe("kayouFinishesForRarity", () => {
    it.each([
      [null, null],
      ["R", null],
      ["N", null],
      ["C", null],
      ["SR", "holo"],
      ["UR", "holo"],
      ["SP", "holo"],
      ["HR", "hr"],
      ["MR", "mr"],
      ["BP", "bp"],
    ] as const)("maps rarity %s → shiny %s", (rarity, shiny) => {
      expect(kayouShinyFinish(rarity)).toBe(shiny);
    });

    it("always keeps a plain finish option", () => {
      expect(kayouFinishesForRarity("SR")).toEqual(["normal", "holo"]);
      expect(kayouFinishesForRarity("HR")).toEqual(["normal", "hr", "holo"]);
      expect(kayouFinishesForRarity("BP")).toEqual(["normal", "bp", "holo"]);
      expect(kayouFinishesForRarity("R")).toEqual(["normal"]);
    });
  });
}
