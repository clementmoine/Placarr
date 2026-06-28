import { beforeEach, describe, expect, it, vi } from "vitest";
import { METADATA_OBSERVATION_SCHEMA_VERSION } from "@/lib/metadata/observations";

vi.mock("./fetch", () => ({
  searchPhilibertHits: vi.fn(),
  fetchPhilibertProduct: vi.fn(),
  resolvePhilibertBackgroundUrl: vi.fn(),
  philibertImageId: (url?: string | null) =>
    url?.match(/cdn1\.philibertnet\.com\/(\d+)/i)?.[1] ?? null,
}));

import {
  fetchPhilibertProduct,
  resolvePhilibertBackgroundUrl,
  searchPhilibertHits,
  type PhilibertProduct,
  type PhilibertSearchHit,
} from "./fetch";
import { createPhilibertResolver, mapPhilibertMetadata } from "./resolver";

const mockedSearchHits = vi.mocked(searchPhilibertHits);
const mockedFetch = vi.mocked(fetchPhilibertProduct);
const mockedBackground = vi.mocked(resolvePhilibertBackgroundUrl);

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
  mockedSearchHits.mockReset();
  mockedFetch.mockReset();
  mockedBackground.mockReset();
  mockedBackground.mockResolvedValue(undefined);
});

describe("createPhilibertResolver — garde barcode→item", () => {
  const resolve = createPhilibertResolver();

  it("accepte le produit quand la page confirme le code-barres, même si le titre diffère", async () => {
    mockedSearchHits.mockResolvedValue([hit()]);
    mockedFetch.mockResolvedValue(
      product({ title: "Catan — Édition FR", barcode: BARCODE }),
    );

    const result = await resolve({
      name: "Nom totalement différent",
      barcode: BARCODE,
    });

    expect(result?.title).toBe("Catan — Édition FR");
  });

  it("accepte le produit quand seule l'URL du résultat confirme le code-barres", async () => {
    mockedSearchHits.mockResolvedValue([hit({ barcode: BARCODE })]);
    mockedFetch.mockResolvedValue(
      product({ title: "Catan — Édition FR", barcode: undefined }),
    );

    const result = await resolve({
      name: "Nom totalement différent",
      barcode: BARCODE,
    });

    expect(result?.title).toBe("Catan — Édition FR");
  });

  it("rejette un produit non confirmé dont le titre ne correspond pas (jamais confidently wrong)", async () => {
    mockedSearchHits.mockResolvedValue([hit({ barcode: undefined })]);
    mockedFetch.mockResolvedValue(
      product({ title: "Échiquier en bois massif", barcode: undefined }),
    );

    const result = await resolve({ name: "Catan", barcode: BARCODE });

    expect(result).toBeNull();
  });

  it("accepte un produit non confirmé si le titre correspond à la requête", async () => {
    mockedSearchHits.mockResolvedValue([hit({ barcode: undefined })]);
    mockedFetch.mockResolvedValue(
      product({ title: "Catan", barcode: undefined }),
    );

    const result = await resolve({ name: "Catan", barcode: BARCODE });

    expect(result?.title).toBe("Catan");
  });

  it("rejette un faux positif proche mais différent (La Maison du Lac)", async () => {
    mockedSearchHits.mockResolvedValue([hit({ barcode: undefined })]);
    mockedFetch.mockResolvedValue(
      product({ title: "La Maison des Souris", barcode: undefined }),
    );

    const result = await resolve({ name: "La Maison du Lac" });

    expect(result).toBeNull();
  });

  it("rejette une recherche par code-barres seul quand rien ne confirme l'EAN", async () => {
    mockedSearchHits.mockResolvedValue([hit({ barcode: undefined })]);
    mockedFetch.mockResolvedValue(
      product({ title: "Produit sans rapport", barcode: undefined }),
    );

    const result = await resolve({ name: "", barcode: BARCODE });

    expect(result).toBeNull();
  });

  it("retourne null quand la recherche ne renvoie aucun résultat", async () => {
    mockedSearchHits.mockResolvedValue([]);

    const result = await resolve({ name: "Catan", barcode: BARCODE });

    expect(result).toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("itère les lookup queries et ignore les faux positifs", async () => {
    mockedSearchHits
      .mockResolvedValueOnce([
        hit({
          url: "https://www.philibertnet.com/fr/jeux/unrelated.html",
        }),
      ])
      .mockResolvedValueOnce([hit()]);

    mockedFetch
      .mockResolvedValueOnce(
        product({
          title: "Totally Unrelated Game",
          productUrl: "https://www.philibertnet.com/fr/jeux/unrelated.html",
        }),
      )
      .mockResolvedValueOnce(product({ title: "Catan" }));

    const result = await resolve({
      name: "Catan",
      lookupQueries: ["Catan bruit", "Catan"],
    });

    expect(result?.title).toBe("Catan");
    expect(mockedSearchHits).toHaveBeenCalledTimes(2);
  });

  it("expose la couverture, le fond et la galerie en attachments", async () => {
    const cover = `https://cdn1.philibertnet.com/100-large_default/catan--${BARCODE}.jpg`;
    const coverOriginal = `https://cdn1.philibertnet.com/100/catan--${BARCODE}.jpg`;
    const wide = `https://cdn1.philibertnet.com/200/catan--${BARCODE}.jpg`;
    const extra = `https://cdn1.philibertnet.com/300/catan--${BARCODE}.jpg`;

    mockedSearchHits.mockResolvedValue([hit({ barcode: BARCODE })]);
    mockedFetch.mockResolvedValue(
      product({
        title: "Catan",
        barcode: BARCODE,
        imageUrl: cover,
        images: [coverOriginal, wide, extra],
      }),
    );
    mockedBackground.mockResolvedValue(wide);

    const result = await resolve({ name: "Catan", barcode: BARCODE });

    expect(result?.attachments).toEqual([
      { type: "cover", url: cover, role: "fr", source: "philibert" },
      { type: "background", url: wide, role: "fr", source: "philibert" },
      { type: "image", url: extra, role: "fr", source: "philibert" },
    ]);
  });
});

describe("mapPhilibertMetadata observations", () => {
  it("emits catalog observations while preserving legacy metadata fields", () => {
    const cover = `https://cdn1.philibertnet.com/100-large_default/catan--${BARCODE}.jpg`;
    const background = `https://cdn1.philibertnet.com/200/catan--${BARCODE}.jpg`;
    const gallery = `https://cdn1.philibertnet.com/300/catan--${BARCODE}.jpg`;

    const metadata = mapPhilibertMetadata({
      title: "Catan",
      description: "Le classique du commerce et des colonies.",
      imageUrl: cover,
      barcode: BARCODE,
      productUrl: "https://www.philibertnet.com/fr/jeux/123-catan.html",
      players: "3 à 4",
      playtime: "60 min",
      ageRating: "10+",
      language: "Français",
      rating: "4.7",
      reviewCount: 128,
      themes: ["Gestion", "Commerce"],
      mechanics: ["Placement"],
      designers: ["Klaus Teuber"],
      publishers: ["Kosmos"],
      priceCents: 3999,
      images: [gallery],
      backgroundImageUrl: background,
    });

    expect(metadata).toMatchObject({
      title: "Catan",
      barcode: BARCODE,
      regionalTitles: [{ region: "fr", text: "Catan" }],
      observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
      imageUrl: cover,
    });

    expect(metadata.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "title",
          role: "catalog_title",
          value: "Catan",
          provenance: expect.objectContaining({
            providerId: "philibert",
            sourceDocumentRole: "catalog_product",
            evidenceSignals: ["structured_data", "barcode_match"],
          }),
          usage: expect.objectContaining({
            displayCandidate: true,
            searchAlias: "strong",
            evidence: "strong",
          }),
        }),
        expect.objectContaining({
          kind: "image",
          role: "cover_front",
          url: cover,
        }),
        expect.objectContaining({
          kind: "fact",
          role: "structured_fact",
          factKind: "players",
          value: "3 à 4",
        }),
        expect.objectContaining({
          kind: "offer",
          role: "retail_offer",
          priceCents: 3999,
          currency: "EUR",
          provenance: expect.objectContaining({
            sourceDocumentRole: "offer",
          }),
          usage: expect.objectContaining({
            displayCandidate: false,
            searchAlias: "none",
            evidence: "weak",
          }),
        }),
      ]),
    );
  });
});
