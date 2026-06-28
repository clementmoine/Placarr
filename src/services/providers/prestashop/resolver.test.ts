import { beforeEach, describe, expect, it, vi } from "vitest";
import { METADATA_OBSERVATION_SCHEMA_VERSION } from "@/lib/metadata/observations";

vi.mock("./fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fetch")>();
  return {
    ...actual,
    searchPrestashopProduct: vi.fn(),
    searchPrestashopHits: vi.fn(),
    fetchPrestashopGallery: vi.fn(),
  };
});

import {
  fetchPrestashopGallery,
  searchPrestashopHits,
  searchPrestashopProduct,
} from "./fetch";
import { createPrestashopResolver } from "./resolver";
import type { PrestashopProduct, PrestashopRetailerConfig } from "./types";

const mockedSearch = vi.mocked(searchPrestashopProduct);
const mockedHits = vi.mocked(searchPrestashopHits);
const mockedGallery = vi.mocked(fetchPrestashopGallery);

const CONFIG: PrestashopRetailerConfig = {
  id: "test-shop",
  label: "Test Shop",
  baseUrl: "https://example.com",
  searchPath: "/recherche",
  searchParam: "search_query",
  types: ["boardgames"],
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
  mockedHits.mockReset();
  mockedGallery.mockReset();
  mockedGallery.mockResolvedValue([]);
  mockedHits.mockResolvedValue([]);
});

describe("createPrestashopResolver — garde barcode→item", () => {
  const resolve = createPrestashopResolver(CONFIG);

  it("rejette un ean13 confirmé quand le titre catalogue ne correspond pas au produit demandé", async () => {
    mockedSearch.mockResolvedValue(
      product({ title: "Catan — Édition FR", barcode: BARCODE }),
    );

    const result = await resolve({
      name: "Nom totalement différent",
      barcode: BARCODE,
    });

    expect(result).toBeNull();
  });

  it("accepte un ean13 confirmé quand le titre catalogue correspond au produit demandé", async () => {
    mockedSearch.mockResolvedValue(
      product({ title: "Catan — Édition FR", barcode: BARCODE }),
    );

    const result = await resolve({ name: "Catan", barcode: BARCODE });

    expect(result?.title).toBe("Catan — Édition FR");
  });

  it("rejette un produit non confirmé par l'ean13 dont le titre ne correspond pas (jamais confidently wrong)", async () => {
    mockedSearch.mockResolvedValue(
      product({ title: "Tapis de souris gamer RGB", barcode: undefined }),
    );

    const result = await resolve({ name: "Catan", barcode: BARCODE });

    expect(result).toBeNull();
  });

  it("accepte un produit non confirmé par l'ean13 si le titre correspond à la requête", async () => {
    mockedSearch.mockResolvedValue(
      product({ title: "Catan", barcode: undefined }),
    );

    const result = await resolve({ name: "Catan", barcode: BARCODE });

    expect(result?.title).toBe("Catan");
  });

  it("rejette une recherche par code-barres seul quand l'ean13 du résultat ne confirme pas", async () => {
    mockedSearch.mockResolvedValue(
      product({ title: "Produit sans rapport", barcode: "9999999999999" }),
    );

    const result = await resolve({ name: "", barcode: BARCODE });

    expect(result).toBeNull();
  });

  it("retourne null quand aucun produit n'est trouvé", async () => {
    mockedSearch.mockResolvedValue(null);

    const result = await resolve({ name: "Catan", barcode: BARCODE });

    expect(result).toBeNull();
  });

  it("rejette un ean13 confirmé mal étiqueté sans accepter un mauvais hit titre", async () => {
    const tlouBarcode = "711719330103";
    mockedSearch.mockResolvedValue(
      product({
        title: "The Last of Us Part II PS4",
        barcode: tlouBarcode,
      }),
    );
    mockedHits.mockResolvedValue([
      {
        name: "The Last of Us Part II PS4",
        link: "https://example.com/the-last-of-us-part-ii-ps4.html",
      },
      {
        name: "Manette PlayStation 4 Collector The Last of Us Part II",
        link: "https://example.com/manette-tlou-part-ii.html",
      },
    ]);

    const result = await resolve({
      name: "The Last of Us Part I",
      barcode: tlouBarcode,
    });

    expect(result).toBeNull();
    expect(mockedHits).toHaveBeenCalled();
  });

  it("ajoute la galerie produit en attachments sans redupliquer la couverture", async () => {
    mockedSearch.mockResolvedValue(
      product({
        title: "Catan",
        barcode: BARCODE,
        priceCents: 4390,
        imageUrl: "https://example.com/100-home_default/catan.jpg",
      }),
    );
    mockedGallery.mockResolvedValue([
      "https://example.com/100-large_default/catan.jpg", // = couverture (id 100)
      "https://example.com/200-large_default/catan.jpg", // 2e photo distincte
    ]);

    const result = await resolve({ name: "Catan", barcode: BARCODE });

    expect(result?.attachments).toEqual([
      {
        type: "cover",
        url: "https://example.com/100-home_default/catan.jpg",
        role: "fr",
        source: "test-shop",
      },
      {
        type: "image",
        url: "https://example.com/200-large_default/catan.jpg",
        role: "fr",
        source: "test-shop",
      },
    ]);
    expect(result?.observationSchemaVersion).toBe(
      METADATA_OBSERVATION_SCHEMA_VERSION,
    );
    expect(result?.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "title",
          role: "catalog_title",
          value: "Catan",
          language: "fr",
          provenance: expect.objectContaining({
            providerId: "test-shop",
            sourceDocumentRole: "catalog_product",
          }),
        }),
        expect.objectContaining({
          kind: "image",
          role: "cover_front",
          type: "cover",
          url: "https://example.com/100-home_default/catan.jpg",
        }),
        expect.objectContaining({
          kind: "image",
          role: "gallery_image",
          type: "image",
          url: "https://example.com/200-large_default/catan.jpg",
        }),
        expect.objectContaining({
          kind: "offer",
          role: "retail_offer",
          priceCents: 4390,
          currency: "EUR",
          provenance: expect.objectContaining({
            sourceDocumentRole: "offer",
          }),
        }),
        expect.objectContaining({
          kind: "external-id",
          role: "barcode",
          idKind: "ean13",
          value: BARCODE,
        }),
      ]),
    );
  });
});
