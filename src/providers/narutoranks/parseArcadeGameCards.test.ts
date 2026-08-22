import { describe, expect, it } from "vitest";

import {
  arcadeListingUrls,
  arcadeReferenceToCard,
  ARCADE_LANG,
  fileEchoesReference,
  namesAgree,
  parseArcadeListing,
} from "./parseArcadeGameCards";

/** Un bloc produit, tel que la boutique l'écrit. */
function product(printed: string, name: string, file: string): string {
  return `<li class="product type-product">
    <a href="/product/x"><img src="https://i0.wp.com/www.arcadegamecards.com/wp-content/uploads/2021/02/${file}?w=740&ssl=1"></a>
    <h2 class="woocommerce-loop-product__title">Naruto 2002 Panini Card ${printed} ${name}</h2>
  </li>`;
}

const CHECKLIST: Record<string, string> = {
  "nr-0002": "Group 7 puzzle",
  "nr-0040": "Rock lee",
  "sd-0003": "Sasuke",
  "sd-0004": "Kakashi",
  "ff-0001": "Guy - Kakashi",
};
const nameOf = (setCode: string, number: string) =>
  CHECKLIST[`${setCode}-${number}`] ?? null;

describe("parseArcadeListing", () => {
  it("retient une carte dont la référence, le fichier et le nom concordent", () => {
    const { cards } = parseArcadeListing(
      product("40", "Rock lee", "naruto2002paninicard40front.jpg"),
      nameOf,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ setCode: "nr", number: "0040" });
  });

  it("accepte un insert, dont le fichier porte le code", () => {
    const { cards } = parseArcadeListing(
      product("FF1", "Guy Kakashi", "naruto2002paniniff1front.jpg"),
      nameOf,
    );
    expect(cards[0]).toMatchObject({ setCode: "ff", number: "0001" });
  });

  it("refuse les deux fiches SD dont les noms sont intervertis", () => {
    // Le cas réel : « SD3 Kakashi » sur le fichier sd3, « SD3 Sasuke » sur le
    // fichier sd4, quand la checklist dit sd3 = Sasuke et sd4 = Kakashi.
    const html =
      product("SD3", "Kakashi", "naruto2002paninisd3front-e161.jpg") +
      product("SD3", "Sasuke", "naruto2002paninisd4front-e161.jpg");
    const { cards, rejected } = parseArcadeListing(html, nameOf);
    expect(cards).toHaveLength(0);
    expect(rejected).toHaveLength(2);
    expect(rejected[0]!.reason).toMatch(/la checklist nomme/);
    // La seconde échoue plus tôt : son fichier dit sd4, son titre SD3.
    expect(rejected[1]!.reason).toMatch(/ne redit pas la référence/);
  });

  it("refuse une référence que la checklist ne connaît pas", () => {
    const { cards, rejected } = parseArcadeListing(
      product("99", "Inconnue", "naruto2002paninicard99front.jpg"),
      nameOf,
    );
    expect(cards).toHaveLength(0);
    expect(rejected[0]!.reason).toMatch(/absente de la checklist/);
  });
});

describe("les trois signaux, pris un par un", () => {
  it("lit la référence : nue pour la base, préfixée pour un insert", () => {
    expect(arcadeReferenceToCard("02")).toEqual({
      setCode: "nr",
      number: "0002",
    });
    expect(arcadeReferenceToCard("FF1")).toEqual({
      setCode: "ff",
      number: "0001",
    });
    expect(arcadeReferenceToCard("")).toBeNull();
  });

  it("vérifie que le fichier redit la référence", () => {
    expect(
      fileEchoesReference("https://x/naruto2002paninicard02front.jpg", "02"),
    ).toBe(true);
    expect(
      fileEchoesReference("https://x/naruto2002paniniff1front.jpg", "FF1"),
    ).toBe(true);
    // Le piège réel : le titre dit SD3, le fichier dit sd4.
    expect(
      fileEchoesReference("https://x/naruto2002paninisd4front-e1.jpg", "SD3"),
    ).toBe(false);
    // Et 12 ne doit pas valider la carte 2.
    expect(
      fileEchoesReference("https://x/naruto2002paninicard12front.jpg", "02"),
    ).toBe(false);
  });

  it("compare les noms sans buter sur la casse ni les séparateurs", () => {
    expect(namesAgree("Guy Kakashi", "Guy - Kakashi")).toBe(true);
    expect(namesAgree("Rock lee", "ROCK LEE")).toBe(true);
    expect(namesAgree("Kakashi", "Sasuke")).toBe(false);
  });

  it("vise l'édition américaine, sur trois pages", () => {
    expect(ARCADE_LANG).toBe("en");
    const urls = arcadeListingUrls();
    expect(urls).toHaveLength(3);
    expect(urls[2]).toMatch(/page\/3\/$/);
  });
});
