import { describe, expect, it } from "vitest";

import { MONSIEURDE_CONFIG } from "./configs";
import { mapPrestashopSearchProduct } from "./fetch";
import {
  extractBarcodeFromProductUrl,
  extractEditionYearFromProductName,
  parseFrenchPriceCents,
  parseIqitRenderedProducts,
  parsePrestashopProductPageBarcode,
  parsePrestashopShortDescription,
} from "./parse";

describe("parsePrestashopShortDescription", () => {
  it("extrait joueurs, durée et âge depuis le HTML Monsieur de", () => {
    const html = `
      <p>Incarnez l'un des premiers colons de l'île de CATAN.</p>
      <address><strong>à partir de 10 ans</strong></address>
      <address><strong>de 3 à 4 joueurs</strong></address>
      <address><strong>75 minutes</strong></address>
    `;

    expect(parsePrestashopShortDescription(html)).toEqual({
      description: "Incarnez l'un des premiers colons de l'île de CATAN.",
      players: "3 à 4",
      playtime: "75 min",
      ageRating: "10+",
    });
  });

  it("extrait l'âge depuis une phrase en texte brut", () => {
    expect(
      parsePrestashopShortDescription(
        "<p>Construisez vos villes. Dès 10 ans.</p>",
      ),
    ).toMatchObject({
      ageRating: "10+",
    });
  });
});

describe("parseFrenchPriceCents", () => {
  it("convertit price_amount en centimes", () => {
    expect(parseFrenchPriceCents(43.9, "43,90 €")).toBe(4390);
  });
});

describe("extractBarcodeFromProductUrl", () => {
  it("extrait l'EAN depuis l'URL produit", () => {
    expect(
      extractBarcodeFromProductUrl(
        "https://www.monsieurde.com/famille/359-catan-3558380126133.html",
      ),
    ).toBe("3558380126133");
  });
});

describe("extractEditionYearFromProductName", () => {
  it("extrait l'année entre parenthèses", () => {
    expect(
      extractEditionYearFromProductName("CATAN : jeu de base (2025)"),
    ).toBe("2025-01-01");
  });
});

describe("mapPrestashopSearchProduct", () => {
  it("mappe un produit AJAX PrestaShop", () => {
    const product = mapPrestashopSearchProduct(MONSIEURDE_CONFIG, {
      name: "Catan (Refresh)",
      price: "43,90 €",
      price_amount: 43.9,
      link: "https://www.monsieurde.com/famille/359-catan-3558380126133.html",
      manufacturer_name: "Kosmos",
      description_short: "<address><strong>de 3 à 4 joueurs</strong></address>",
      cover: {
        bySize: {
          home_default: {
            url: "https://www.monsieurde.com/27326-home_default/catan.jpg",
          },
        },
      },
      reference: "KOSCAT0102FR",
    });

    expect(product).toMatchObject({
      title: "Catan (Refresh)",
      barcode: "3558380126133",
      manufacturer: "Kosmos",
      priceCents: 4390,
      players: "3 à 4",
      productUrl:
        "https://www.monsieurde.com/famille/359-catan-3558380126133.html",
      source: "monsieurde",
    });
  });
});

describe("parseIqitRenderedProducts", () => {
  it("extrait titre, lien, prix et image depuis product-miniature", () => {
    const rendered = `
      <div class="product-miniature js-product-miniature" data-id-product="14324">
        <article class="product-container">
          <a href="https://apriloshop.fr/jeux-xbox-one/star-wars-jedi-survivor" class="product-cover-link">
            <img src="https://apriloshop.fr/40143-home_default/star-wars.jpg"
              alt="Star Wars Jedi Survivor XBOX SERIES X [NEUF]" />
          </a>
          <h5 class="product-name">
            <a href="https://apriloshop.fr/jeux-xbox-one/star-wars-jedi-survivor"
              title="Star Wars Jedi Survivor XBOX SERIES X [NEUF]">
              Star Wars Jedi Survivor XBOX SERIES X [NEUF]
            </a>
          </h5>
          <span class="price product-price" aria-label="Prix">19,90&nbsp;€</span>
        </article>
      </div>
    `;

    expect(parseIqitRenderedProducts(rendered)).toEqual([
      {
        id_product: 14324,
        name: "Star Wars Jedi Survivor XBOX SERIES X [NEUF]",
        link: "https://apriloshop.fr/jeux-xbox-one/star-wars-jedi-survivor",
        price: "19,90&nbsp;€",
        price_amount: 19.9,
        cover: {
          bySize: {
            home_default: {
              url: "https://apriloshop.fr/40143-home_default/star-wars.jpg",
            },
          },
        },
      },
    ]);
  });

  it("renvoie une liste vide sans miniature", () => {
    expect(parseIqitRenderedProducts("<div>aucun résultat</div>")).toEqual([]);
  });

  it("parse les miniatures AngarTheme (ChipWeld)", () => {
    const rendered = `
      <article class="product-miniature js-product-miniature" data-id-product="2572">
        <a href="https://www.chipweld.fr/jeux-playstation-4/2572-trine-ultimate-collection-5016488132497.html" class="thumbnail product-thumbnail">
          <img
            src="https://www.chipweld.fr/4336-home_default/trine-ultimate-collection.jpg"
            alt="Trine: Ultimate Collection"
            data-full-size-image-url="https://www.chipweld.fr/4336-large_default/trine-ultimate-collection.jpg"
          >
        </a>
        <h3 class="h3 product-title"><a href="https://www.chipweld.fr/jeux-playstation-4/2572-trine-ultimate-collection-5016488132497.html">Trine: Ultimate Collection</a></h3>
        <span class="price">19,99&nbsp;€</span>
      </article>
    `;

    expect(parseIqitRenderedProducts(rendered)).toEqual([
      {
        id_product: 2572,
        name: "Trine: Ultimate Collection",
        link: "https://www.chipweld.fr/jeux-playstation-4/2572-trine-ultimate-collection-5016488132497.html",
        price: "19,99&nbsp;€",
        price_amount: 19.99,
        cover: {
          bySize: {
            large_default: {
              url: "https://www.chipweld.fr/4336-large_default/trine-ultimate-collection.jpg",
            },
            home_default: {
              url: "https://www.chipweld.fr/4336-home_default/trine-ultimate-collection.jpg",
            },
          },
        },
      },
    ]);
  });
});

describe("parsePrestashopProductPageBarcode", () => {
  it("lit gtin13 depuis le JSON-LD", () => {
    expect(
      parsePrestashopProductPageBarcode(`"gtin13": "5035224124367"`),
    ).toBe("5035224124367");
  });

  it("lit l'EAN depuis la référence produit", () => {
    expect(
      parsePrestashopProductPageBarcode(`"reference":"5035224124367_1"`),
    ).toBe("5035224124367");
  });
});
