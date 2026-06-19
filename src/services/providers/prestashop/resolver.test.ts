import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./fetch", () => ({
  searchPrestashopProduct: vi.fn(),
}));

import { searchPrestashopProduct } from "./fetch";
import { createPrestashopResolver } from "./resolver";
import type { PrestashopProduct, PrestashopRetailerConfig } from "./types";

const mockedSearch = vi.mocked(searchPrestashopProduct);

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
});
