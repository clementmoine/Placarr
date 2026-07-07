import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));
import axios from "axios";

import {
  extractLeDenicheurProductGtinFromHtml,
  extractLeDenicheurProductId,
  fetchPricesFromLeDenicheur,
  leDenicheurGtinForItem,
  parseLeDenicheurPriceSummary,
} from "./fetch";

const mockedPost = vi.mocked(axios.post);
const mockedGet = vi.mocked(axios.get);

function productNode(
  name: string,
  regular = 29.99,
  path = "/product.php?p=5752524",
) {
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
  mockedGet.mockReset();
  mockedGet.mockResolvedValue({ status: 404, data: "" });
  delete process.env.FLARESOLVERR_URL;
});

describe("extractLeDenicheurProductGtinFromHtml", () => {
  it("lit le GTIN depuis le payload RSC de la fiche produit", () => {
    expect(
      extractLeDenicheurProductGtinFromHtml(
        'payload \\"children\\":\\"GTIN\\" foo \\"children\\":\\"05906395350148\\" tail',
      ),
    ).toBe("05906395350148");
  });

  it("choisit le GTIN qui matche l'EAN item quand la page en liste plusieurs", () => {
    expect(
      leDenicheurGtinForItem(
        "<div>00827912079678, 00721450083817, 0403347790057</div>",
        "0827912079678",
      ),
    ).toBe("00827912079678");
  });
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
    expect(
      extractLeDenicheurProductId("/product.php?p=hades-switch"),
    ).toBeNull();
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

  it("accepte un code-barres sans filtrage de pertinence hors ancrage EAN", async () => {
    mockedPost
      .mockResolvedValueOnce(
        bffResponse([productNode("Produit générique", 12)]),
      )
      .mockResolvedValueOnce(
        productDetailResponse(5752524, "Produit générique", 12, null),
      );

    const result = await fetchPricesFromLeDenicheur("5021290082728");
    expect(result?.productName).toBe("Produit générique");
    expect(result?.priceNew).toBe(1200);
  });

  it("rejette un produit dont le GTIN de page contredit l'EAN item", async () => {
    mockedPost.mockResolvedValueOnce(
      bffResponse([
        productNode(
          "Black Stories: Funny Death Edition 2",
          12,
          "/product.php?p=4955683",
        ),
      ]),
    );
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: "<p>GTIN</p><div>05906395350148</div>",
    } as never);

    const result = await fetchPricesFromLeDenicheur("Black Stories", {
      itemBarcode: "0827912079678",
    });
    expect(result).toBeNull();
    expect(mockedGet).toHaveBeenCalled();
  });

  it("retient le bon produit quand le GTIN confirmé est plus loin dans les résultats", async () => {
    const wrongEdition = (id: number, name: string) =>
      productNode(name, 12, `/product.php?p=${id}`);
    mockedPost.mockResolvedValueOnce(
      bffResponse([
        wrongEdition(4955676, "Black Stories 10"),
        wrongEdition(4955683, "Black Stories: Funny Death Edition 2"),
        productNode("Black Stories", 15.9, "/product.php?p=2608098"),
      ]),
    );
    mockedGet
      .mockResolvedValueOnce({
        status: 200,
        data: 'payload \\"children\\":\\"GTIN\\" foo \\"children\\":\\"1111111111111\\"',
      } as never)
      .mockResolvedValueOnce({
        status: 200,
        data: 'payload \\"children\\":\\"GTIN\\" foo \\"children\\":\\"05906395350148\\"',
      } as never)
      .mockResolvedValueOnce({
        status: 200,
        data: "<div>00827912079678, 00721450083817, 0403347790057</div>",
      } as never);
    mockedPost.mockResolvedValueOnce(
      productDetailResponse(2608098, "Black Stories", 15.9, null),
    );

    const result = await fetchPricesFromLeDenicheur("Black Stories", {
      itemBarcode: "0827912079678",
    });
    expect(result?.sourceUrl).toBe(
      "https://ledenicheur.fr/product.php?p=2608098",
    );
    expect(result?.productGtin).toBe("00827912079678");
  });

  it("rejects a wrong edition when GTIN is unknown but the item title is specific", async () => {
    mockedPost.mockResolvedValueOnce(
      bffResponse([
        productNode(
          "Black Stories: Funny Death Edition 2",
          12,
          "/product.php?p=4955683",
        ),
      ]),
    );
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: "<html><body><p>Pas de GTIN ici</p></body></html>",
    } as never);

    const result = await fetchPricesFromLeDenicheur(
      ["0721450083770", "Black Stories - Femmes Fatales"],
      {
        itemBarcode: "0721450083770",
        itemTitle: "Black Stories - Femmes Fatales",
      },
    );
    expect(result).toBeNull();
  });

  it("accepte un produit sans GTIN de page quand le titre est aligné", async () => {
    mockedPost
      .mockResolvedValueOnce(
        bffResponse([productNode("Black Stories", 12, "/product.php?p=9999")]),
      )
      .mockResolvedValueOnce(
        productDetailResponse(9999, "Black Stories", 12, null),
      );
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: "<html><body>Informations produit</body></html>",
    } as never);

    const result = await fetchPricesFromLeDenicheur("Black Stories", {
      itemBarcode: "0827912079678",
    });
    expect(result?.productName).toBe("Black Stories");
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
