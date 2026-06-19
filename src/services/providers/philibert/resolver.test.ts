import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./fetch", () => ({
  searchPhilibert: vi.fn(),
  fetchPhilibertProduct: vi.fn(),
}));

import {
  fetchPhilibertProduct,
  searchPhilibert,
  type PhilibertProduct,
  type PhilibertSearchHit,
} from "./fetch";
import { createPhilibertResolver } from "./resolver";

const mockedSearch = vi.mocked(searchPhilibert);
const mockedFetch = vi.mocked(fetchPhilibertProduct);

// EAN-13 valide → normalizeProductBarcode est idempotent dessus.
const BARCODE = "3558380126133";

function hit(overrides: Partial<PhilibertSearchHit> = {}): PhilibertSearchHit {
  return {
    url: "https://www.philibertnet.com/fr/jeux/123-catan.html",
    ...overrides,
  };
}

function product(overrides: Partial<PhilibertProduct> = {}): PhilibertProduct {
  return {
    title: "Catan",
    productUrl: "https://www.philibertnet.com/fr/jeux/123-catan.html",
    ...overrides,
  };
}

beforeEach(() => {
  mockedSearch.mockReset();
  mockedFetch.mockReset();
});

describe("createPhilibertResolver — garde barcode→item", () => {
  const resolve = createPhilibertResolver();

  it("accepte le produit quand la page confirme le code-barres, même si le titre diffère", async () => {
    mockedSearch.mockResolvedValue(hit());
    mockedFetch.mockResolvedValue(
      product({ title: "Catan — Édition FR", barcode: BARCODE }),
    );

    const result = await resolve("Nom totalement différent", BARCODE);

    expect(result?.title).toBe("Catan — Édition FR");
  });

  it("accepte le produit quand seule l'URL du résultat confirme le code-barres", async () => {
    mockedSearch.mockResolvedValue(hit({ barcode: BARCODE }));
    mockedFetch.mockResolvedValue(
      product({ title: "Catan — Édition FR", barcode: undefined }),
    );

    const result = await resolve("Nom totalement différent", BARCODE);

    expect(result?.title).toBe("Catan — Édition FR");
  });

  it("rejette un produit non confirmé dont le titre ne correspond pas (jamais confidently wrong)", async () => {
    mockedSearch.mockResolvedValue(hit({ barcode: undefined }));
    mockedFetch.mockResolvedValue(
      product({ title: "Échiquier en bois massif", barcode: undefined }),
    );

    const result = await resolve("Catan", BARCODE);

    expect(result).toBeNull();
  });

  it("accepte un produit non confirmé si le titre correspond à la requête", async () => {
    mockedSearch.mockResolvedValue(hit({ barcode: undefined }));
    mockedFetch.mockResolvedValue(
      product({ title: "Catan", barcode: undefined }),
    );

    const result = await resolve("Catan", BARCODE);

    expect(result?.title).toBe("Catan");
  });

  it("rejette une recherche par code-barres seul quand rien ne confirme l'EAN", async () => {
    mockedSearch.mockResolvedValue(hit({ barcode: undefined }));
    mockedFetch.mockResolvedValue(
      product({ title: "Produit sans rapport", barcode: undefined }),
    );

    const result = await resolve("", BARCODE);

    expect(result).toBeNull();
  });

  it("retourne null quand la recherche ne renvoie aucun résultat", async () => {
    mockedSearch.mockResolvedValue(null);

    const result = await resolve("Catan", BARCODE);

    expect(result).toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
