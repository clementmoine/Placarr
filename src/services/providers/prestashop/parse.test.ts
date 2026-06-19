import { describe, expect, it } from "vitest";

import { MONSIEURDE_CONFIG } from "./configs";
import { mapPrestashopSearchProduct } from "./fetch";
import {
  extractBarcodeFromProductUrl,
  extractEditionYearFromProductName,
  parseFrenchPriceCents,
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
      description_short:
        "<address><strong>de 3 à 4 joueurs</strong></address>",
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
      productUrl: "https://www.monsieurde.com/famille/359-catan-3558380126133.html",
      source: "monsieurde",
    });
  });
});
