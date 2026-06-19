import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({ default: { post: vi.fn() } }));
import axios from "axios";

import { fetchPricesFromLeDenicheur } from "./fetch";

const mockedPost = vi.mocked(axios.post);

function productNode(name: string, regular = 29.99) {
  return {
    __typename: "Product",
    name,
    pathName: "/product.php?p=hades-switch",
    priceSummary: {
      regular,
      inStock: null,
      alternative: null,
      count: 4,
    },
    media: { first: "https://example.com/hades.jpg" },
  };
}

function bffResponse(nodes: unknown[]) {
  return {
    status: 200,
    data: {
      data: {
        newSearch: {
          results: {
            products: { nodes },
          },
        },
      },
    },
  } as never;
}

beforeEach(() => {
  mockedPost.mockReset();
});

describe("fetchPricesFromLeDenicheur", () => {
  it("convertit un produit BFF en prix en centimes", async () => {
    mockedPost.mockResolvedValue(
      bffResponse([productNode("Hades Nintendo Switch", 39.9)]),
    );

    await expect(fetchPricesFromLeDenicheur("hades switch")).resolves.toEqual({
      priceNew: 3990,
      sourceUrl: "https://ledenicheur.fr/product.php?p=hades-switch",
      productName: "Hades Nintendo Switch",
      offerCount: 4,
      coverUrl: "https://example.com/hades.jpg",
      matchedQuery: "hades switch",
    });
  });

  it("ignore les résultats non pertinents avant le bon match", async () => {
    mockedPost.mockResolvedValue(
      bffResponse([
        productNode("Apple iPhone 15 Pro"),
        productNode("Hades Nintendo Switch", 34.5),
      ]),
    );

    const result = await fetchPricesFromLeDenicheur("hades switch");
    expect(result?.productName).toBe("Hades Nintendo Switch");
    expect(result?.priceNew).toBe(3450);
  });

  it("accepte un code-barres sans filtrage de pertinence", async () => {
    mockedPost.mockResolvedValue(
      bffResponse([productNode("Produit générique", 12)]),
    );

    const result = await fetchPricesFromLeDenicheur("5021290082728");
    expect(result?.productName).toBe("Produit générique");
    expect(result?.priceNew).toBe(1200);
  });

  it("parse une offre marchande", async () => {
    mockedPost.mockResolvedValue(
      bffResponse([
        {
          __typename: "Offer",
          name: "Hades - Micromania",
          externalUri: "https://shop.example/hades",
          offerPrice: { regular: 19.99 },
          store: { name: "Micromania" },
          media: { first: null },
        },
      ]),
    );

    await expect(fetchPricesFromLeDenicheur("hades")).resolves.toMatchObject({
      priceNew: 1999,
      merchantName: "Micromania",
      sourceUrl: "https://shop.example/hades",
    });
  });

  it("renvoie null sur erreur HTTP BFF", async () => {
    mockedPost.mockResolvedValue({ status: 500, data: {} } as never);
    expect(await fetchPricesFromLeDenicheur("hades switch")).toBeNull();
  });
});
