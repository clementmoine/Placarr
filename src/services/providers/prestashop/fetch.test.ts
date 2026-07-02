import { beforeEach, describe, expect, it, vi } from "vitest";

import { parsePrestashopGallery, prestashopImageId } from "./fetch";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

import axios from "axios";

import { APRILOSHOP_CONFIG, MONSIEURDE_CONFIG, TOKYOGAMESTORY_CONFIG } from "./configs";
import { searchPrestashopProduct } from "./fetch";

const mockedGet = vi.mocked(axios.get);

const IQIT_MINIATURE = `
  <div class="product-miniature js-product-miniature">
    <h5 class="product-name">
      <a href="https://apriloshop.fr/jeux-xbox-one/star-wars-jedi-survivor">
        Star Wars Jedi Survivor XBOX SERIES X [NEUF]
      </a>
    </h5>
    <img src="https://apriloshop.fr/40143-home_default/star-wars.jpg" />
    <span class="price product-price">19,90&nbsp;€</span>
  </div>
`;

beforeEach(() => {
  mockedGet.mockReset();
});

describe("prestashopImageId", () => {
  it("extrait l'id image quelle que soit la taille", () => {
    expect(
      prestashopImageId("https://www.monsieurde.com/11949-large_default/x.jpg"),
    ).toBe("11949");
    expect(prestashopImageId("https://www.monsieurde.com/11949/x.jpg")).toBe(
      "11949",
    );
    expect(prestashopImageId(null)).toBeNull();
  });
});

describe("parsePrestashopGallery", () => {
  it("extrait les images produit distinctes via data-image-large-src", () => {
    const html = `
      <img data-image-large-src="https://www.monsieurde.com/11949-large_default/jeu.jpg">
      <img data-image-large-src="https://www.monsieurde.com/11949-large_default/jeu.jpg">
      <img data-image-large-src="https://www.monsieurde.com/11950-large_default/jeu.jpg">
      <img src="https://www.monsieurde.com/99999-home_default/cross-sell.jpg">
    `;

    expect(parsePrestashopGallery(html)).toEqual([
      "https://www.monsieurde.com/11949-large_default/jeu.jpg",
      "https://www.monsieurde.com/11950-large_default/jeu.jpg",
    ]);
  });

  it("renvoie une liste vide sans galerie", () => {
    expect(parsePrestashopGallery("<div>pas d'images</div>")).toEqual([]);
  });
});

describe("searchPrestashopProduct", () => {
  it("utilise products[] pour la stratégie native", async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        products: [
          {
            name: "Catan",
            link: "https://www.monsieurde.com/famille/359-catan-3558380126133.html",
            price_amount: 43.9,
            ean13: "3558380126133",
            cover: {
              bySize: {
                home_default: {
                  url: "https://www.monsieurde.com/27326-home_default/catan.jpg",
                },
              },
            },
          },
        ],
      },
    });

    const product = await searchPrestashopProduct(
      MONSIEURDE_CONFIG,
      "Catan",
      "3558380126133",
    );

    expect(product).toMatchObject({
      title: "Catan",
      barcode: "3558380126133",
      source: "monsieurde",
    });
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("parse rendered_products pour la stratégie IQIT et enrichit l'EAN", async () => {
    mockedGet
      .mockResolvedValueOnce({
        data: {
          products: [],
          rendered_products: IQIT_MINIATURE,
        },
      })
      .mockResolvedValueOnce({
        data: `<script>"gtin13": "5035224124367"</script>`,
        status: 200,
      });

    const product = await searchPrestashopProduct(
      APRILOSHOP_CONFIG,
      "",
      "5035224124367",
    );

    expect(product).toMatchObject({
      title: "Star Wars Jedi Survivor XBOX SERIES X [NEUF]",
      barcode: "5035224124367",
      priceCents: 1990,
      source: "apriloshop",
    });
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("renvoie null quand IQIT ne renvoie aucune miniature", async () => {
    mockedGet.mockResolvedValueOnce({
      data: { products: [], rendered_products: "<div>aucun résultat</div>" },
    });

    await expect(
      searchPrestashopProduct(APRILOSHOP_CONFIG, "zelda"),
    ).resolves.toBeNull();
  });

  it("trouve The Exit 8 sur Tokyo Game Story via le JSON products[]", async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        products: [
          {
            name: "The Exit 8 + Platform 8 PS4 Japan Game in ENG-FRA-DEU-ESP-ITA New",
            link: "https://tokyogamestory.com/fr/playstation-4-ps4-tout/10513-the-exit-8-platform-8-ps4-japan-game-in-eng-fra-deu-esp-ita-new-4589794580661.html",
            reference: "4589794580661",
            price: "34,99 €",
            cover: {
              bySize: {
                large_default: {
                  url: "https://tokyogamestory.com/116702-large_default/the-exit-8.jpg",
                },
              },
            },
          },
        ],
      },
    });

    const product = await searchPrestashopProduct(
      TOKYOGAMESTORY_CONFIG,
      "The Exit 8",
      "4589794580661",
    );

    expect(product).toMatchObject({
      title: "The Exit 8 + Platform 8 PS4 Japan Game in ENG-FRA-DEU-ESP-ITA New",
      barcode: "4589794580661",
      priceCents: 3499,
      source: "tokyogamestory",
    });
  });
});
