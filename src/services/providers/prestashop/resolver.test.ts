import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./fetch", () => ({
  searchPrestashopProduct: vi.fn(),
  fetchPrestashopGallery: vi.fn(),
  prestashopImageId: (url?: string | null) =>
    url?.match(/\/(\d+)(?:-[a-z_]+)?\/[^/?#]+\.(?:jpe?g|png|webp|gif)/i)?.[1] ??
    null,
}));

import { fetchPrestashopGallery, searchPrestashopProduct } from "./fetch";
import { createPrestashopResolver } from "./resolver";
import type { PrestashopProduct, PrestashopRetailerConfig } from "./types";

const mockedSearch = vi.mocked(searchPrestashopProduct);
const mockedGallery = vi.mocked(fetchPrestashopGallery);

const CONFIG: PrestashopRetailerConfig = {
  id: "test-shop",
  label: "Test Shop",
  baseUrl: "https://example.com",
  searchPath: "/recherche",
  searchParam: "search_query",
};

// EAN-13 valide → normalizeProductBarcode est idempotent dessus.
const BARCODE = "3558380126133";

function product(
  overrides: Partial<PrestashopProduct> = {},
): PrestashopProduct {
  return {
    title: "Catan",
    source: "test-shop",
    productUrl: "https://example.com/catan",
    ...overrides,
  };
}

beforeEach(() => {
  mockedSearch.mockReset();
  mockedGallery.mockReset();
  mockedGallery.mockResolvedValue([]);
});

describe("createPrestashopResolver — garde barcode→item", () => {
  const resolve = createPrestashopResolver(CONFIG);

  it("accepte le produit quand l'ean13 confirme le code-barres, même si le titre diffère", async () => {
    mockedSearch.mockResolvedValue(
      product({ title: "Catan — Édition FR", barcode: BARCODE }),
    );

    const result = await resolve("Nom totalement différent", BARCODE);

    expect(result?.title).toBe("Catan — Édition FR");
  });

  it("rejette un produit non confirmé par l'ean13 dont le titre ne correspond pas (jamais confidently wrong)", async () => {
    mockedSearch.mockResolvedValue(
      product({ title: "Tapis de souris gamer RGB", barcode: undefined }),
    );

    const result = await resolve("Catan", BARCODE);

    expect(result).toBeNull();
  });

  it("accepte un produit non confirmé par l'ean13 si le titre correspond à la requête", async () => {
    mockedSearch.mockResolvedValue(
      product({ title: "Catan", barcode: undefined }),
    );

    const result = await resolve("Catan", BARCODE);

    expect(result?.title).toBe("Catan");
  });

  it("rejette une recherche par code-barres seul quand l'ean13 du résultat ne confirme pas", async () => {
    mockedSearch.mockResolvedValue(
      product({ title: "Produit sans rapport", barcode: "9999999999999" }),
    );

    const result = await resolve("", BARCODE);

    expect(result).toBeNull();
  });

  it("retourne null quand aucun produit n'est trouvé", async () => {
    mockedSearch.mockResolvedValue(null);

    const result = await resolve("Catan", BARCODE);

    expect(result).toBeNull();
  });

  it("ajoute la galerie produit en attachments sans redupliquer la couverture", async () => {
    mockedSearch.mockResolvedValue(
      product({
        title: "Catan",
        barcode: BARCODE,
        imageUrl: "https://example.com/100-home_default/catan.jpg",
      }),
    );
    mockedGallery.mockResolvedValue([
      "https://example.com/100-large_default/catan.jpg", // = couverture (id 100)
      "https://example.com/200-large_default/catan.jpg", // 2e photo distincte
    ]);

    const result = await resolve("Catan", BARCODE);

    expect(result?.attachments).toEqual([
      {
        type: "cover",
        url: "https://example.com/100-home_default/catan.jpg",
        source: "test-shop",
      },
      {
        type: "image",
        url: "https://example.com/200-large_default/catan.jpg",
        source: "test-shop",
      },
    ]);
  });
});
