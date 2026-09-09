import { describe, expect, it } from "vitest";

import {
  mapOfficialMythosCard,
  mergeOfficialMythosLangRows,
  officialMythosGrouping,
  parseOfficialMythosApiPayload,
  type OfficialMythosApiCard,
} from "./parseOfficialCards";

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
    expect(merged[0]!.faceUrl).toBe("https://cdn/fr.webp");
  });
});
