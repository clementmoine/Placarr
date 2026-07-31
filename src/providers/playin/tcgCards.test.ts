import { describe, expect, it } from "vitest";

import {
  parsePlayInCardHits,
  parsePlayInCardOffersFromText,
  parsePlayInCardPageHtml,
  parsePlayInEuroCents,
  playInCardMatchesPrintKey,
  playInCardSearchUrl,
  resolvePlayInSetCode,
} from "./tcgCards";

describe("playInCardSearchUrl", () => {
  it("targets Lorcana singles search", () => {
    expect(playInCardSearchUrl("Ariel Sur des jambes humaines")).toContain(
      "searchType=CARDS",
    );
    expect(playInCardSearchUrl("Ariel Sur des jambes humaines")).toContain(
      "family=18",
    );
  });
});

describe("parsePlayInEuroCents", () => {
  it("parses FR retail amounts", () => {
    expect(parsePlayInEuroCents("0,25")).toBe(25);
    expect(parsePlayInEuroCents("1 600,00")).toBe(160_000);
    expect(parsePlayInEuroCents("1\u202f600,00 €")).toBe(160_000);
  });
});

describe("resolvePlayInSetCode", () => {
  it("maps Play-In image slugs and chapitre labels", () => {
    expect(resolvePlayInSetCode({ imageSetSlug: "tfc" })).toBe("1");
    expect(resolvePlayInSetCode({ imageSetSlug: "AOV" })).toBe("13");
    expect(
      resolvePlayInSetCode({ setLabel: "Premier Chapitre" }),
    ).toBe("1");
    expect(
      resolvePlayInSetCode({
        setLabel: "Invasion Épineuse ! Chapitre 13",
      }),
    ).toBe("13");
  });
});

describe("parsePlayInCardHits", () => {
  it("extracts /fr/carte links", () => {
    const html = `
      <a href="/fr/carte/51053/ariel-sur-des-jambes-humaines">Ariel - Sur des jambes humaines</a>
      <a href="/en/carte/83272/belle-la-bete-tout-comme-les-etoiles">Belle</a>
    `;
    expect(parsePlayInCardHits(html)).toEqual([
      {
        url: "https://www.play-in.com/fr/carte/51053/ariel-sur-des-jambes-humaines",
        productId: "51053",
        title: "Ariel - Sur des jambes humaines",
      },
      {
        url: "https://www.play-in.com/fr/carte/83272/belle-la-bete-tout-comme-les-etoiles",
        productId: "83272",
        title: "Belle",
      },
    ]);
  });
});

describe("parsePlayInCardOffersFromText", () => {
  it("keeps Mint/Nmint and FOIL, skips Iconique", () => {
    const text = `
      Mint/Nmint 1,50 €
      Mint/Nmint FOIL 4,00 €
      Mint/Nmint FOIL Iconique 1 600,00 €
    `;
    expect(parsePlayInCardOffersFromText(text)).toEqual([
      { condition: "new", priceCents: 150, label: "Mint/Nmint" },
      { condition: "foil", priceCents: 400, label: "Mint/Nmint FOIL" },
    ]);
  });
});

describe("parsePlayInCardPageHtml + printKey match", () => {
  const html = `
    <h1>Ariel - Sur des jambes humaines Ariel - On Human Legs</h1>
    <img src="https://media.play-in.com/images/cartes/lor_tfc/1.png" />
    <div>Premier Chapitre</div>
    <div>N° de carte 1</div>
    <div>Rareté Commune</div>
    <span>Mint/Nmint</span><span>0,25 €</span>
    <span>Mint/Nmint</span><span>FOIL</span><span>0,75 €</span>
  `;

  it("parses identity and EUR offers", () => {
    const page = parsePlayInCardPageHtml(
      html,
      "https://www.play-in.com/fr/carte/51053/ariel-sur-des-jambes-humaines",
    );
    expect(page.cardNumber).toBe("1");
    expect(page.setCode).toBe("1");
    expect(page.imageSetSlug).toBe("tfc");
    expect(page.offers).toEqual([
      { condition: "new", priceCents: 25, label: "Mint/Nmint" },
      { condition: "foil", priceCents: 75, label: "Mint/Nmint FOIL" },
    ]);
  });

  it("matches lorcana printKey set+number", () => {
    const page = parsePlayInCardPageHtml(
      html,
      "https://www.play-in.com/fr/carte/51053/ariel",
    );
    expect(playInCardMatchesPrintKey(page, "lorcana:1-1")).toBe(true);
    expect(playInCardMatchesPrintKey(page, "lorcana:1-2")).toBe(false);
    expect(playInCardMatchesPrintKey(page, "lorcana:2-1")).toBe(false);
    expect(playInCardMatchesPrintKey(page, "lorcana:1-1-p1")).toBe(false);
  });
});
