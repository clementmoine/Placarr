import { describe, expect, it } from "vitest";

import {
  mergeGoatEnCcgCardsIntoIndex,
  parseGoatEnCcgListing,
} from "./parseGoatEnCcg";
import { goatEnCcgSetsToScrape } from "./scrapeGoatEnCcg";

const FIXTURE = `
<a>Anbu - N-082 - Super Rare - 1st Edition - Foil</a>
<a>Anbu - N-082 - Super Rare - Unlimited Edition - Foil</a>
<a>Baiu - N-077 - Common - Unlimited Edition</a>
<a>A Tool Called 'Ninja' - M-050 - Rare - 1st Edition</a>
`;

describe("parseGoatEnCcgListing", () => {
  it("dedupes finishes and keeps Bandai N/J/M numbers", () => {
    expect(parseGoatEnCcgListing(FIXTURE, "s2")).toEqual([
      {
        number: "m050",
        cardType: "m",
        name: "A Tool Called 'Ninja'",
        setCode: "s2",
      },
      { number: "n077", cardType: "n", name: "Baiu", setCode: "s2" },
      { number: "n082", cardType: "n", name: "Anbu", setCode: "s2" },
    ]);
  });

  it("pairs the CDN JPEG from the listing img, dropping /medium/", () => {
    const html = `
<a>A Tool Called 'Ninja' - M-050 - Common - 1st Edition</a>
<img loading="lazy" src="https://crystalcommerce-assets.nyc3.cdn.digitaloceanspaces.com/photos/202638/medium/144519.jpg" alt="A Tool Called 'Ninja' - M-050 - Common - 1st Edition">
`;
    expect(parseGoatEnCcgListing(html, "s2")).toEqual([
      {
        number: "m050",
        cardType: "m",
        name: "A Tool Called 'Ninja'",
        setCode: "s2",
        faceUrl:
          "https://crystalcommerce-assets.nyc3.cdn.digitaloceanspaces.com/photos/202638/144519.jpg",
      },
    ]);
  });
});

describe("goatEnCcgSetsToScrape", () => {
  it("covers s1–s27 as fill after official Bandai lists, skipping Storm 3 and the s8 reprints drawer", () => {
    const sets = goatEnCcgSetsToScrape();
    expect(sets.map((row) => row.setCode)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
      "s6",
      "s7",
      "s8",
      "s9",
      "s10",
      "s11",
      "s12",
      "s13",
      "s14",
      "s15",
      "s16",
      "s17",
      "s18",
      "s19",
      "s20",
      "s21",
      "s22",
      "s23",
      "s24",
      "s25",
      "s26",
      "s27",
    ]);
    expect(sets.some((row) => row.role === "reprints-drawer")).toBe(false);
  });
});

describe("mergeGoatEnCcgCardsIntoIndex", () => {
  it("mints N prints beside NI and does not overwrite BGG titles", () => {
    const merged = mergeGoatEnCcgCardsIntoIndex({
      prints: [
        {
          printKey: "naruto:ni-0082",
          setCode: "s2",
          number: "ni0082",
          cardType: "ni",
          family: "ninja",
        },
        {
          printKey: "naruto:n-0082",
          setCode: "s2",
          number: "n0082",
          cardType: "n",
          family: "ninja",
        },
      ],
      titles: [
        { printKey: "naruto:n-0082", lang: "en", fullName: "Anbu (BGG)" },
      ],
      cards: parseGoatEnCcgListing(FIXTURE, "s2"),
    });
    expect(
      merged.titles.find((t) => t.printKey === "naruto:n-0082")?.fullName,
    ).toBe("Anbu (BGG)");
    expect(merged.addedPrints).toContain("naruto:n-0077");
    expect(merged.prints.some((p) => p.printKey === "naruto:ni-0082")).toBe(
      true,
    );
  });
});

describe("la rareté du shop entre au catalogue", () => {
  it("pose la rareté sur un titre neuf", () => {
    const merged = mergeGoatEnCcgCardsIntoIndex({
      prints: [],
      titles: [],
      cards: [
        {
          number: "n0041",
          cardType: "n",
          name: "Rock Lee",
          setCode: "s1",
          rarity: "Rare",
        },
      ],
    });
    expect(merged.titles[0]).toMatchObject({ lang: "en", rarity: "Rare" });
    expect(merged.rarityFilled).toHaveLength(1);
  });

  it("comble la rareté d'un titre déjà connu au lieu de sauter la ligne", () => {
    const merged = mergeGoatEnCcgCardsIntoIndex({
      prints: [],
      titles: [{ printKey: "naruto:n-0041", lang: "en", fullName: "Rock Lee" }],
      cards: [
        {
          number: "n0041",
          cardType: "n",
          name: "Rock Lee",
          setCode: "s1",
          rarity: "Rare",
        },
      ],
    });
    expect(merged.titles[0]?.rarity).toBe("Rare");
    expect(merged.rarityFilled).toEqual(["naruto:n-0041"]);
  });

  it("ne réécrit pas une rareté déjà posée", () => {
    const merged = mergeGoatEnCcgCardsIntoIndex({
      prints: [],
      titles: [
        {
          printKey: "naruto:n-0041",
          lang: "en",
          fullName: "Rock Lee",
          rarity: "Super Rare",
        },
      ],
      cards: [
        {
          number: "n0041",
          cardType: "n",
          name: "Rock Lee",
          setCode: "s1",
          rarity: "Rare",
        },
      ],
    });
    expect(merged.titles[0]?.rarity).toBe("Super Rare");
    expect(merged.rarityFilled).toEqual([]);
  });
});
