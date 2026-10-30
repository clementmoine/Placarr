import { describe, expect, it } from "vitest";
import {
  mapOfficialMythosCard,
  matchMythosSs2FaceUrl,
  mergeOfficialMythosLangRows,
  type OfficialMythosApiCard,
  officialMythosGrouping,
  parseMythosSs2FaceStem,
  parseMythosSs2FaceUrlsFromHtml,
  parseOfficialMythosApiPayload,
} from "./catalogues";

// —— parseOfficialCards ——
{
  describe("parseOfficialMythosApiPayload", () => {
    it("lit le tableau Cards du payload gallery", () => {
      expect(
        parseOfficialMythosApiPayload([
          { Title: "Card Gallery FR", Cards: [{ SKU: "NM-S1E1-C001FAV1" }] },
        ]),
      ).toHaveLength(1);
      expect(parseOfficialMythosApiPayload([])).toEqual([]);
    });
  });

  describe("mapOfficialMythosCard", () => {
    it("mappe KS1 base, Rare Art, Legendary et 2e édition", () => {
      expect(
        mapOfficialMythosCard({
          SKU: "NM-S1E1-C001FAV1",
          ID: "001/130",
          Rarity: "C",
          Variant: "Full Art",
          Edition: "1st edition",
          Set: "Set 1: Konoha Shidō",
          Title: "Hiruzen Sarutobi",
          Version: "Le Professeur",
          Image: "https://cdn/a.webp",
        }),
      ).toMatchObject({
        setCode: "ks1",
        number: "0001",
        grouping: null,
        printed: "001/130",
        name: "Hiruzen Sarutobi — Le Professeur",
      });

      expect(
        mapOfficialMythosCard({
          SKU: "NM-S1E1-RA104V1",
          ID: "104/130",
          Rarity: "RA",
          Edition: "1st edition",
          Set: "Set 1: Konoha Shidō",
          Title: "Tsunade",
        })?.grouping,
      ).toBe("a");

      expect(
        mapOfficialMythosCard({
          SKU: "NM-S1E1-L133V1",
          ID: "133/130",
          Rarity: "L",
          Edition: "1st edition",
          Set: "Set 1: Konoha Shidō",
        })?.grouping,
      ).toBe("l");

      expect(
        mapOfficialMythosCard({
          SKU: "NM-S1E2-C001FAV1",
          ID: "001/130",
          Rarity: "C",
          Edition: "2nd edition",
          Set: "Set 1: Konoha Shidō",
        })?.setCode,
      ).toBe("ks1e2");
    });

    it("mappe missions, CHIBI, promo V2 et Mythos M1", () => {
      expect(
        mapOfficialMythosCard({
          SKU: "NM-S1E1-MSS001V1",
          ID: "MSS 01",
          Rarity: "Mission",
          CardType: "Mission",
          Edition: "1st edition",
          Set: "Set 1: Konoha Shidō",
          Title: "Appel De Soutien",
        }),
      ).toMatchObject({ number: "mss01", printed: "MSS01", grouping: null });

      expect(
        officialMythosGrouping({
          SKU: "NM-S2E1-CH078V1",
          Rarity: "CHIBI",
          CardVersion: "V1",
        }),
      ).toBe("chibi");

      expect(
        mapOfficialMythosCard({
          SKU: "NM-S1E0-M104V2-W",
          ID: "104/130",
          Rarity: "M",
          CardVersion: "V2",
          Edition: "",
          Set: "Set 1: Konoha Shidō",
        }),
      ).toMatchObject({
        setCode: "ks1promo",
        number: "0104",
        grouping: "vv2w",
      });

      expect(
        mapOfficialMythosCard({
          SKU: "M1",
          ID: "121/140",
          Rarity: "Mythos",
          Edition: "1st edition",
          Set: "Set 2: Shinobi Shiren",
          Title: "Naruto Uzumaki",
        }),
      ).toMatchObject({ setCode: "ss2", number: "m1", grouping: null });
    });
  });

  describe("mergeOfficialMythosLangRows", () => {
    it("garde FR + EN au lieu de collapser sur un seul titre", () => {
      const fr: OfficialMythosApiCard = {
        SKU: "M3",
        ID: "147/140",
        Rarity: "Mythos",
        Edition: "1st edition",
        Set: "Set 2: Shinobi Shiren",
        Title: "Naruto Uzumaki",
        Version: "Vainqueur",
        Image: "https://cdn/fr.webp",
      };
      const en: OfficialMythosApiCard = {
        ...fr,
        Title: "Naruto Uzumaki",
        Version: "Winner",
        Image: "https://cdn/en.webp",
      };
      const merged = mergeOfficialMythosLangRows({ fr: [fr], en: [en] });
      expect(merged).toHaveLength(1);
      expect(merged[0]!.name).toContain("Vainqueur");
      expect(merged[0]!.titles.map((t) => t.lang).sort()).toEqual(["en", "fr"]);
      expect(merged[0]!.faceUrl).toBe("https://cdn/fr.webp");
    });

    it("complète un titre FR vide depuis EN", () => {
      const fr: OfficialMythosApiCard = {
        SKU: "M3",
        ID: "147/140",
        Rarity: "Mythos",
        Edition: "1st edition",
        Set: "Set 2: Shinobi Shiren",
        Title: "",
        Image: "https://cdn/fr.webp",
      };
      const en: OfficialMythosApiCard = {
        ...fr,
        Title: "Naruto Uzumaki",
        Version: "Winner",
        Image: "https://cdn/en.webp",
      };
      const merged = mergeOfficialMythosLangRows({ fr: [fr], en: [en] });
      expect(merged).toHaveLength(1);
      expect(merged[0]!.name).toContain("Naruto Uzumaki");
      expect(merged[0]!.titles).toEqual([
        { lang: "en", fullName: "Naruto Uzumaki — Winner" },
      ]);
      expect(merged[0]!.faceUrl).toBe("https://cdn/fr.webp");
    });
  });
}

// —— parseLorenzoneSs2Faces ——
{
  describe("parseMythosSs2FaceStem", () => {
    it.each([
      [
        "001-140-hiruzen-sarutobi-leader-of-the-leaf-village-full-art-shinobi-shiren-en.webp",
        { number: "0001", grouping: null },
      ],
      [
        "031-140-kimimaro-i-am-not-his-pawn-chibi-shinobi-shiren-en.webp",
        { number: "0031", grouping: "chibi" },
      ],
      [
        "147-140-naruto-uzumaki-i-m-finding-my-own-ninja-way-pop-shinobi-shiren-en.webp",
        { number: "0147", grouping: "pop" },
      ],
      [
        "000-000-gaara-why-won-t-he-give-up-legendaire-shinobi-shiren-en.webp",
        { number: "lg00", grouping: null },
      ],
      [
        "001-000-jiraiya-pervy-sage-legendaire-shinobi-shiren-en.webp",
        { number: "lg01", grouping: null },
      ],
      [
        "mss01-140-new-forces-mission-shinobi-shiren-en.webp",
        { number: "mss01", grouping: null },
      ],
      [
        "087-141-weights-holo-shinobi-shiren-en.webp",
        { number: "0087", grouping: null },
      ],
    ])("%s", (stem, expected) => {
      expect(parseMythosSs2FaceStem(stem)).toEqual(expected);
    });
  });

  describe("parseMythosSs2FaceUrlsFromHtml", () => {
    it("dedupes and matches checklist keys, including grouping fallback", () => {
      const html = `
        <img src="https://cdn.shopify.com/s/files/1/0776/0848/5206/files/001-140-hiruzen-full-art-shinobi-shiren-en.webp">
        <img src="https://cdn.shopify.com/s/files/1/0776/0848/5206/files/061-140-teuchi-full-art-shinobi-shiren-en.webp">
        <img src="https://cdn.shopify.com/s/files/1/0776/0848/5206/files/Logo_Preco_Long.png">
      `;
      const hits = parseMythosSs2FaceUrlsFromHtml(html);
      expect(hits).toHaveLength(2);
      expect(matchMythosSs2FaceUrl(hits, { number: "0001" })).toContain(
        "001-140-hiruzen",
      );
      // Checklist may tag Teuchi as chibi while CDN stem is full-art only.
      expect(
        matchMythosSs2FaceUrl(hits, { number: "0061", grouping: "chibi" }),
      ).toContain("061-140-teuchi");
    });
  });
}
