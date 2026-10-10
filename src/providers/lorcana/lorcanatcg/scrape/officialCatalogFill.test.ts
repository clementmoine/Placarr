import { describe, expect, it } from "vitest";

import {
  parseOfficialCardIdentifier,
  parseOfficialCatalogCards,
  ravensburgerImageLang,
  ravensburgerMediaConflictsLang,
  resolveOfficialSetCode,
  selectOfficialCatalogFill,
  toOfficialCatalogFillPrint,
  type OfficialCatalogCard,
} from "./officialCatalogFill";

function card(
  overrides: Partial<OfficialCatalogCard> & {
    cardIdentifier: string;
    name: string;
  },
): OfficialCatalogCard {
  return {
    cultureInvariantId: null,
    cardSets: ["set14"],
    subtitle: null,
    rarity: "SUPER",
    inkColors: ["AMBER"],
    inkCost: 1,
    lore: 2,
    strength: 0,
    willpower: 4,
    inkwell: true,
    subtypes: ["Dreamborn", "Héros"],
    author: "Gonzalo Kenny",
    flavorText: null,
    thumbnailUrl: null,
    kind: "characters",
    variants: [
      {
        variantId: "Regular",
        detailImageUrl:
          "https://api.lorcana.ravensburger.com/images/fr/set14/23_abc.jpg",
        foilMaskUrl: null,
        varnishMaskUrl: null,
        foilType: null,
        hotFoilColor: null,
      },
    ],
    ...overrides,
  };
}

describe("ravensburgerImageLang", () => {
  it("lit la langue du chemin CDN", () => {
    expect(
      ravensburgerImageLang(
        "https://api.lorcana.ravensburger.com/images/fr/set14/23.jpg",
      ),
    ).toBe("fr");
    expect(
      ravensburgerImageLang(
        "https://api.lorcana.ravensburger.com/images/en/d23/13.jpg",
      ),
    ).toBe("en");
    expect(ravensburgerImageLang("https://cdn.example/art.png")).toBeNull();
  });

  it("détecte un conflit lang/CDN", () => {
    expect(
      ravensburgerMediaConflictsLang(
        "fr",
        "https://api.lorcana.ravensburger.com/images/en/challenge1/4.jpg",
      ),
    ).toBe(true);
    expect(
      ravensburgerMediaConflictsLang(
        "fr",
        "https://api.lorcana.ravensburger.com/images/fr/set1/4.jpg",
      ),
    ).toBe(false);
  });
});

describe("parseOfficialCardIdentifier", () => {
  it("lit un tirage de set principal", () => {
    expect(parseOfficialCardIdentifier("241/204 FR 14")).toEqual({
      number: "241",
      variant: null,
      middle: "204",
      promoGrouping: null,
      setCardCount: 204,
      languageMark: "FR",
      setTail: "14",
    });
  });

  it("lit une promo P4 sous son chapitre", () => {
    expect(parseOfficialCardIdentifier("14/P4 FR 13")).toMatchObject({
      number: "14",
      promoGrouping: "P4",
      setCardCount: null,
      setTail: "13",
    });
  });

  it("lit un D23", () => {
    expect(parseOfficialCardIdentifier("13/D23 EN 14")).toMatchObject({
      number: "13",
      promoGrouping: "D23",
      setTail: "14",
    });
  });

  it("lit une quête Q2", () => {
    expect(parseOfficialCardIdentifier("18/35 FR Q2")).toMatchObject({
      number: "18",
      setCardCount: 35,
      setTail: "Q2",
    });
  });
});

describe("resolveOfficialSetCode", () => {
  it("préfère setN sur questN", () => {
    expect(resolveOfficialSetCode(["quest2", "set8"], "8")).toBe("8");
  });

  it("mappe quest-seul vers QN", () => {
    expect(resolveOfficialSetCode(["quest2"], "Q2")).toBe("Q2");
  });
});

describe("toOfficialCatalogFillPrint", () => {
  it("ancre Mickey FR Hyperia sur lorcana:14-23", () => {
    const mapped = toOfficialCatalogFillPrint(
      card({
        cardIdentifier: "23/204 FR 14",
        name: "Mickey Mouse",
        subtitle: "Le meilleur de la ville",
        cultureInvariantId: 3288,
        rarity: "SUPER",
      }),
      "fr",
      new Map([["14", "Hyperia City"]]),
    );
    expect(mapped).toMatchObject({
      printKey: "lorcana:14-23",
      language: "fr",
      fullName: "Mickey Mouse - Le meilleur de la ville",
      searchName: "mickey mouse le meilleur de la ville",
      rarity: "Très Rare",
      cardType: "Personnage",
      color: "Ambre",
      setName: "Hyperia City",
      providerId: "3288",
      imageUrl:
        "https://api.lorcana.ravensburger.com/images/fr/set14/23_abc.jpg",
    });
  });

  it("ancre l’iconique 241 et le D23", () => {
    expect(
      toOfficialCatalogFillPrint(
        card({
          cardIdentifier: "241/204 FR 14",
          name: "Mickey Mouse",
          subtitle: "Le meilleur de la ville",
          rarity: "ICONIC",
          cultureInvariantId: 3506,
          variants: [
            {
              variantId: "Regular",
              detailImageUrl:
                "https://api.lorcana.ravensburger.com/images/fr/set14/241_x.jpg",
              foilMaskUrl:
                "https://api.lorcana.ravensburger.com/images/fr/set14/241_m.jpg",
              varnishMaskUrl:
                "https://api.lorcana.ravensburger.com/images/fr/set14/241_v.jpg",
              foilType: "Lore",
              hotFoilColor: "#FFB348",
            },
          ],
        }),
        "fr",
      ),
    ).toMatchObject({
      printKey: "lorcana:14-241",
      rarity: "Iconique",
      foilTypes: ["Lore"],
      foilEffectColors: ["#FFB348"],
      foilMaskUrl:
        "https://api.lorcana.ravensburger.com/images/fr/set14/241_m.jpg",
      varnishMaskUrl:
        "https://api.lorcana.ravensburger.com/images/fr/set14/241_v.jpg",
    });

    expect(
      toOfficialCatalogFillPrint(
        card({
          cardIdentifier: "13/D23 EN 14",
          name: "Héctor Rivera",
          subtitle: "En miettes",
          variants: [
            {
              variantId: "Regular",
              detailImageUrl:
                "https://api.lorcana.ravensburger.com/images/en/d23/13_abc.jpg",
              foilMaskUrl: null,
              varnishMaskUrl: null,
              foilType: null,
              hotFoilColor: null,
            },
          ],
        }),
        "fr",
      ),
    ).toBeNull();
  });

  it("refuse une face FR dont le CDN est /images/en/", () => {
    expect(
      toOfficialCatalogFillPrint(
        card({
          cardIdentifier: "4/204 FR 1",
          name: "Rapunzel",
          subtitle: "Gifted with Healing",
          cardSets: ["set1"],
          variants: [
            {
              variantId: "Regular",
              detailImageUrl:
                "https://api.lorcana.ravensburger.com/images/en/challenge1/4_abc.jpg",
              foilMaskUrl: null,
              varnishMaskUrl: null,
              foilType: null,
              hotFoilColor: null,
            },
          ],
        }),
        "fr",
      ),
    ).toBeNull();
  });

  it("accepte une promo FR avec image /images/fr/", () => {
    expect(
      toOfficialCatalogFillPrint(
        card({
          cardIdentifier: "14/P4 FR 13",
          name: "Promo",
          subtitle: "Test",
          cardSets: ["set13"],
          variants: [
            {
              variantId: "Regular",
              detailImageUrl:
                "https://api.lorcana.ravensburger.com/images/fr/promo4/14_abc.jpg",
              foilMaskUrl: null,
              varnishMaskUrl: null,
              foilType: null,
              hotFoilColor: null,
            },
          ],
        }),
        "fr",
      )?.printKey,
    ).toBe("lorcana:13-14-p4");
  });
});

describe("selectOfficialCatalogFill", () => {
  it("ne pose une face FR que si le tirage existe et le titre manque", () => {
    const cards = [
      card({
        cardIdentifier: "23/204 FR 14",
        name: "Mickey Mouse",
        subtitle: "Le meilleur de la ville",
      }),
      card({
        cardIdentifier: "7/204 FR 14",
        name: "Priya Mangal",
        subtitle: "Fan inamovible",
      }),
    ];
    const existing = new Set(["lorcana:14-23"]);
    const covered = new Set<string>();
    const selected = selectOfficialCatalogFill(
      cards,
      "fr",
      covered,
      existing,
    );
    expect(selected.map((c) => c.printKey)).toEqual(["lorcana:14-23"]);
  });

  it("ne remplace pas un titre LorcanaJSON déjà tenu", () => {
    const cards = [
      card({
        cardIdentifier: "23/204 FR 14",
        name: "Mickey Mouse",
        subtitle: "Le meilleur de la ville",
      }),
    ];
    const selected = selectOfficialCatalogFill(
      cards,
      "fr",
      new Set(["lorcana:14-23\0fr"]),
      new Set(["lorcana:14-23"]),
    );
    expect(selected).toEqual([]);
  });
});

describe("parseOfficialCatalogCards", () => {
  it("aplatit characters/actions depuis le payload Companion", () => {
    const parsed = parseOfficialCatalogCards({
      cards: {
        characters: [
          {
            name: "Mickey Mouse",
            subtitle: "Le meilleur de la ville",
            card_identifier: "241/204 FR 14",
            card_sets: ["set14"],
            culture_invariant_id: 3506,
            rarity: "ICONIC",
            magic_ink_colors: ["AMBER"],
            variants: [
              {
                variant_id: "Regular",
                detail_image_url:
                  "https://api.lorcana.ravensburger.com/images/fr/set14/241.jpg",
              },
            ],
          },
        ],
        actions: [],
        items: [],
        locations: [],
      },
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      name: "Mickey Mouse",
      subtitle: "Le meilleur de la ville",
      cultureInvariantId: 3506,
      kind: "characters",
    });
  });
});
