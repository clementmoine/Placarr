import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({ default: { post: vi.fn() } }));
import axios from "axios";

import {
  extractLeDenicheurProductId,
  fetchPricesFromLeDenicheur,
  parseLeDenicheurPriceSummary,
} from "./fetch";

const mockedPost = vi.mocked(axios.post);

function productNode(name: string, regular = 29.99, path = "/product.php?p=5752524") {
  return {
    __typename: "Product",
    name,
    pathName: path,
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

function productDetailResponse(
  productId: number,
  name: string,
  regular: number,
  alternative: number | null,
) {
  return {
    status: 200,
    data: {
      data: {
        product: {
          name,
          pathName: `/product.php?p=${productId}`,
          priceSummary: {
            regular,
            alternative,
            inStock: regular,
            count: 18,
          },
          media: { first: "https://example.com/detail.jpg" },
        },
      },
    },
  } as never;
}

beforeEach(() => {
  mockedPost.mockReset();
});

describe("parseLeDenicheurPriceSummary", () => {
  it("sépare le neuf (regular) de l'occasion (alternative)", () => {
    expect(
      parseLeDenicheurPriceSummary({
        regular: 21.99,
        alternative: 34.99,
        inStock: 21.99,
        count: 18,
      }),
    ).toEqual({ priceNew: 2199, priceUsed: 3499 });
  });

  it("n'émet pas d'occasion quand alternative vaut le neuf", () => {
    expect(
      parseLeDenicheurPriceSummary({
        regular: 34.23,
        alternative: 34.23,
        inStock: null,
        count: 2,
      }),
    ).toEqual({ priceNew: 3423, priceUsed: undefined });
  });

  it("ignore une alternative aberrante (outlier marketplace)", () => {
    expect(
      parseLeDenicheurPriceSummary({
        regular: 12.73,
        alternative: 1000,
        inStock: 12.73,
        count: 4,
      }),
    ).toEqual({ priceNew: 1273, priceUsed: undefined });
  });
});

describe("extractLeDenicheurProductId", () => {
  it("extrait l'id numérique depuis pathName", () => {
    expect(extractLeDenicheurProductId("/product.php?p=6546817")).toBe(6546817);
    expect(extractLeDenicheurProductId("/product.php?p=hades-switch")).toBeNull();
  });
});

describe("fetchPricesFromLeDenicheur", () => {
  it("convertit un produit BFF en prix en centimes", async () => {
    mockedPost
      .mockResolvedValueOnce(
        bffResponse([productNode("Hades Nintendo Switch", 39.9)]),
      )
      .mockResolvedValueOnce(
        productDetailResponse(5752524, "Hades Nintendo Switch", 39.9, null),
      );

    await expect(fetchPricesFromLeDenicheur("hades switch")).resolves.toEqual({
      priceNew: 3990,
      priceUsed: undefined,
      sourceUrl: "https://ledenicheur.fr/product.php?p=5752524",
      productName: "Hades Nintendo Switch",
      offerCount: 18,
      coverUrl: "https://example.com/detail.jpg",
      matchedQuery: "hades switch",
    });
  });

  it("évite la fiche produit quand la recherche fournit déjà neuf + occasion", async () => {
    mockedPost.mockResolvedValueOnce(
      bffResponse([
        {
          __typename: "Product",
          name: "Hades Nintendo Switch",
          pathName: "/product.php?p=5752524",
          priceSummary: {
            regular: 21.99,
            alternative: 34.99,
            inStock: 21.99,
            count: 9,
          },
          media: { first: "https://example.com/hades.jpg" },
        },
      ]),
    );

    await expect(fetchPricesFromLeDenicheur("hades switch")).resolves.toEqual({
      priceNew: 2199,
      priceUsed: 3499,
      sourceUrl: "https://ledenicheur.fr/product.php?p=5752524",
      productName: "Hades Nintendo Switch",
      offerCount: 9,
      coverUrl: "https://example.com/hades.jpg",
      matchedQuery: "hades switch",
    });
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });

  it("récupère l'occasion depuis la fiche produit quand la recherche ne la sépare pas", async () => {
    mockedPost
      .mockResolvedValueOnce(
        bffResponse([
          productNode(
            "The Last of Us: Part I (PS5)",
            21.99,
            "/product.php?p=6546817",
          ),
        ]),
      )
      .mockResolvedValueOnce(
        productDetailResponse(
          6546817,
          "The Last of Us: Part I (PS5)",
          21.99,
          34.99,
        ),
      );

    await expect(
      fetchPricesFromLeDenicheur("The Last of Us Part I PS5"),
    ).resolves.toMatchObject({
      priceNew: 2199,
      priceUsed: 3499,
      productName: "The Last of Us: Part I (PS5)",
      sourceUrl: "https://ledenicheur.fr/product.php?p=6546817",
    });
  });

  it("ignore les résultats non pertinents avant le bon match", async () => {
    mockedPost
      .mockResolvedValueOnce(
        bffResponse([
          productNode("Apple iPhone 15 Pro"),
          productNode("Hades Nintendo Switch", 34.5),
        ]),
      )
      .mockResolvedValueOnce(
        productDetailResponse(5752524, "Hades Nintendo Switch", 34.5, null),
      );

    const result = await fetchPricesFromLeDenicheur("hades switch");
    expect(result?.productName).toBe("Hades Nintendo Switch");
    expect(result?.priceNew).toBe(3450);
  });

  it("accepte un code-barres sans filtrage de pertinence", async () => {
    mockedPost
      .mockResolvedValueOnce(bffResponse([productNode("Produit générique", 12)]))
      .mockResolvedValueOnce(
        productDetailResponse(5752524, "Produit générique", 12, null),
      );

    const result = await fetchPricesFromLeDenicheur("5021290082728");
    expect(result?.productName).toBe("Produit générique");
    expect(result?.priceNew).toBe(1200);
  });

  it("parse une offre marchande", async () => {
    mockedPost.mockResolvedValueOnce(
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
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });

  it("renvoie null sur erreur HTTP BFF", async () => {
    mockedPost.mockResolvedValue({ status: 500, data: {} } as never);
    expect(await fetchPricesFromLeDenicheur("hades switch")).toBeNull();
  });
});
