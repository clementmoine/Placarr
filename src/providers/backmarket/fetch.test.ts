import { readFileSync } from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: { get: vi.fn(), post: vi.fn(), head: vi.fn() },
}));
vi.mock("@/lib/http/flareSolverr", () => ({
  flareSolverrRequestGet: vi.fn().mockResolvedValue(null),
}));

const readBackMarketSearchEvidence = vi.fn();
const promoteBackMarketSearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  readBackMarketSearchEvidence: (...args: unknown[]) =>
    readBackMarketSearchEvidence(...args),
  promoteBackMarketSearchEvidence: (...args: unknown[]) =>
    promoteBackMarketSearchEvidence(...args),
}));

import axios from "axios";

import {
  backmarketSearchUrl,
  enrichBackMarketProductGallery,
  parseBackMarketProductGallery,
  parseBackMarketProductPage,
  parseBackMarketProductUuidFromUrl,
  parseBackMarketSearchHits,
  fetchFromBackMarket,
  fetchFromBackMarketProductUrl,
  fetchPricesFromBackMarket,
  resetBackMarketResponseCacheForTests,
} from "./fetch";
import { mapBackMarketMetadata } from "./index";

const mockedGet = vi.mocked(axios.get);

function fixture(name: string) {
  return readFileSync(
    path.join(__dirname, "fixtures", name),
    "utf8",
  );
}

beforeEach(() => {
  mockedGet.mockReset();
  readBackMarketSearchEvidence.mockReset();
  promoteBackMarketSearchEvidence.mockReset();
  readBackMarketSearchEvidence.mockResolvedValue(null);
  promoteBackMarketSearchEvidence.mockResolvedValue(undefined);
  resetBackMarketResponseCacheForTests();
  delete process.env.FLARESOLVERR_URL;
});

describe("backmarketSearchUrl", () => {
  it("builds the FR search URL", () => {
    expect(backmarketSearchUrl("Nintendo Wii Bleu")).toBe(
      "https://www.backmarket.fr/fr-fr/search?q=Nintendo%20Wii%20Bleu",
    );
  });
});

describe("parseBackMarketProductUuidFromUrl", () => {
  it("extracts the product UUID from a /p/ URL", () => {
    expect(
      parseBackMarketProductUuidFromUrl(
        "https://www.backmarket.fr/fr-fr/p/console-nintendo-wii-bleu/7383740a-64c1-4b44-aa1c-b65a512979a1?l=11",
      ),
    ).toBe("7383740a-64c1-4b44-aa1c-b65a512979a1");
  });

  it("rejects search URLs", () => {
    expect(
      parseBackMarketProductUuidFromUrl(
        "https://www.backmarket.fr/fr-fr/search?q=Nintendo+Wii+Bleu",
      ),
    ).toBeNull();
  });
});

describe("parseBackMarketSearchHits", () => {
  it("parses Wii Bleu hits from __NUXT_DATA__", () => {
    const hits = parseBackMarketSearchHits(fixture("wii-bleu-search.html"));
    expect(hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Nintendo Wii - Bleu",
          priceCents: 15200,
          currency: "EUR",
          grade: "Très bon état",
          brand: "99 Nintendo",
          model: "999 Wii",
          category: "Consoles de jeux (rétro)",
          sourceUrl: expect.stringContaining(
            "/fr-fr/p/console-nintendo-wii-bleu/7383740a-64c1-4b44-aa1c-b65a512979a1",
          ),
          coverUrl: expect.stringContaining("cloudfront.net"),
          warrantyMonths: 12,
          reviewAverage: 3.96,
        }),
      ]),
    );
  });

  it("parses multiple PS3 Slim Grise variants and keeps distinct UUIDs", () => {
    const hits = parseBackMarketSearchHits(
      fixture("ps3-slim-grise-search.html"),
    );
    expect(hits.length).toBeGreaterThanOrEqual(3);
    expect(hits.every((hit) => /PlayStation 3 Slim/i.test(hit.title))).toBe(
      true,
    );
    const uuids = new Set(
      hits.map((hit) => parseBackMarketProductUuidFromUrl(hit.sourceUrl)),
    );
    expect(uuids.size).toBe(hits.length);
    expect(Math.min(...hits.map((hit) => hit.priceCents))).toBe(20252);
  });

  it("returns empty when Nuxt payload is missing", () => {
    expect(parseBackMarketSearchHits("<html></html>")).toEqual([]);
  });
});

describe("parseBackMarketProductGallery", () => {
  it("extracts the catalog image gallery from a product page", () => {
    const urls = parseBackMarketProductGallery(
      fixture("wii-bleu-product.html"),
      "7383740a-64c1-4b44-aa1c-b65a512979a1",
    );
    expect(urls).toEqual([
      "https://d2e6ccujb3mkqf.cloudfront.net/7383740a-64c1-4b44-aa1c-b65a512979a1-1_aaa.jpg",
      "https://d2e6ccujb3mkqf.cloudfront.net/7383740a-64c1-4b44-aa1c-b65a512979a1-2_bbb.jpg",
      "https://d2e6ccujb3mkqf.cloudfront.net/7383740a-64c1-4b44-aa1c-b65a512979a1-3_ccc.jpg",
    ]);
  });
});

describe("parseBackMarketProductPage", () => {
  it("rebuilds a hit with the full catalog gallery from a PDP (no search cards)", () => {
    const html = fixture("2ds-bleu-product.html");
    expect(parseBackMarketSearchHits(html)).toEqual([]);

    const hit = parseBackMarketProductPage(
      html,
      "6edd4848-1dec-4060-bb16-fe0c3b9e7df2",
    );
    expect(hit).toMatchObject({
      title: "Nintendo 2DS - Bleu",
      brand: "Nintendo",
      model: "Nintendo 2DS",
      priceCents: 16570,
      grade: "Très bon état",
      sourceUrl:
        "https://www.backmarket.fr/fr-fr/p/console-nintendo-2ds-2go-noirbleu/6edd4848-1dec-4060-bb16-fe0c3b9e7df2",
    });
    expect(hit?.imageUrls).toHaveLength(5);
    expect(hit?.coverUrl).toBe(hit?.imageUrls?.[0]);
  });
});

describe("fetchFromBackMarketProductUrl", () => {
  it("returns the PDP gallery when search-card rows are absent", async () => {
    mockedGet.mockResolvedValue({
      status: 200,
      data: fixture("2ds-bleu-product.html"),
    } as never);

    const result = await fetchFromBackMarketProductUrl(
      "https://www.backmarket.fr/fr-fr/p/console-nintendo-2ds-2go-noirbleu/6edd4848-1dec-4060-bb16-fe0c3b9e7df2",
      ["Nintendo 2DS"],
      { shelfType: "hardware" },
    );

    expect(result).toMatchObject({
      title: "Nintendo 2DS - Bleu",
      priceCents: 16570,
    });
    expect(result?.imageUrls).toHaveLength(5);
    expect(mapBackMarketMetadata(result)?.attachments).toHaveLength(5);
  });
});

describe("fetchFromBackMarket", () => {
  it("returns cover + listing fields alongside the cheapest aligned hit", async () => {
    mockedGet.mockResolvedValue({
      status: 200,
      data: fixture("ps3-slim-grise-search.html"),
    } as never);

    const result = await fetchFromBackMarket(
      "PlayStation 3 Slim grise",
      ["PlayStation 3 Slim grise", "Sony PlayStation 3 Slim - Gris"],
      { shelfType: "hardware" },
    );

    expect(result).toMatchObject({
      title: "Sony PlayStation 3 Slim - Gris",
      priceCents: 20252,
      grade: "Très bon état",
      sourceUrl: expect.stringContaining("/fr-fr/p/"),
      coverUrl: expect.stringContaining("cloudfront.net"),
    });
    expect(promoteBackMarketSearchEvidence).toHaveBeenCalled();
  });

  it("réutilise ProviderEvidence SearchYield sans HTTP", async () => {
    readBackMarketSearchEvidence.mockResolvedValueOnce([
      {
        title: "Sony PlayStation 3 Slim - Gris",
        priceCents: 20252,
        currency: "EUR",
        grade: "Très bon état",
        coverUrl: "https://cdn.example.com/ps3.jpg",
        sourceUrl:
          "https://www.backmarket.fr/fr-fr/p/sony-playstation-3-slim-gris/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      },
    ]);

    const result = await fetchFromBackMarket(
      "PlayStation 3 Slim grise",
      ["PlayStation 3 Slim grise", "Sony PlayStation 3 Slim - Gris"],
      { shelfType: "hardware" },
    );

    expect(result).toMatchObject({
      title: "Sony PlayStation 3 Slim - Gris",
      priceCents: 20252,
    });
    expect(mockedGet).not.toHaveBeenCalled();
    expect(promoteBackMarketSearchEvidence).not.toHaveBeenCalled();
  });
});

describe("mapBackMarketMetadata", () => {
  it("maps title, cover attachment, brand and product link", () => {
    const hits = parseBackMarketSearchHits(fixture("wii-bleu-search.html"));
    const wii = hits.find((hit) => /Wii - Bleu/i.test(hit.title));
    expect(wii).toBeTruthy();

    const metadata = mapBackMarketMetadata(wii!);
    expect(metadata).toMatchObject({
      title: "Nintendo Wii - Bleu",
      imageUrl: expect.stringContaining("cloudfront.net"),
      externalIds: {
        backmarket: "7383740a-64c1-4b44-aa1c-b65a512979a1",
      },
      attachments: [
        expect.objectContaining({
          type: "cover",
          source: "backmarket",
          retailCatalogImageTitlesSource: true,
        }),
      ],
    });
    expect(metadata?.facts?.map((fact) => fact.kind)).toEqual(
      expect.arrayContaining([
        "external-link",
        "brand",
        "condition",
        "observed-price",
      ]),
    );
  });

  it("maps every catalog gallery image as an attachment", () => {
    const hits = parseBackMarketSearchHits(fixture("wii-bleu-search.html"));
    const wii = hits.find((hit) => /Wii - Bleu/i.test(hit.title));
    expect(wii).toBeTruthy();

    const gallery = parseBackMarketProductGallery(
      fixture("wii-bleu-product.html"),
      "7383740a-64c1-4b44-aa1c-b65a512979a1",
    );
    const metadata = mapBackMarketMetadata({
      ...wii!,
      coverUrl: gallery[0],
      imageUrls: gallery,
    });

    expect(metadata?.attachments).toHaveLength(3);
    expect(metadata?.attachments?.map((attachment) => attachment.url)).toEqual(
      gallery,
    );
    expect(metadata?.imageUrl).toBe(gallery[0]);
  });

  it("returns null without a title", () => {
    expect(mapBackMarketMetadata(null)).toBeNull();
  });
});

describe("fetchPricesFromBackMarket", () => {
  it("picks the cheapest title-aligned hit", async () => {
    mockedGet.mockResolvedValue({
      status: 200,
      data: fixture("ps3-slim-grise-search.html"),
    } as never);

    const result = await fetchPricesFromBackMarket(
      "PlayStation 3 Slim grise",
      ["PlayStation 3 Slim grise", "Sony PlayStation 3 Slim - Gris"],
      { shelfType: "hardware" },
    );

    expect(result).toMatchObject({
      priceUsed: 20252,
      productName: "Sony PlayStation 3 Slim - Gris",
      grade: "Très bon état",
      sourceUrl: expect.stringContaining("/fr-fr/p/"),
    });
  });

  it("réutilise le SearchYield HTML après metadata (0 HTTP extra)", async () => {
    mockedGet.mockResolvedValue({
      status: 200,
      data: fixture("ps3-slim-grise-search.html"),
    } as never);

    await fetchFromBackMarket(
      "PlayStation 3 Slim grise",
      ["PlayStation 3 Slim grise", "Sony PlayStation 3 Slim - Gris"],
      { shelfType: "hardware" },
    );
    const httpAfterMeta = mockedGet.mock.calls.length;

    await expect(
      fetchPricesFromBackMarket(
        "PlayStation 3 Slim grise",
        ["PlayStation 3 Slim grise", "Sony PlayStation 3 Slim - Gris"],
        { shelfType: "hardware" },
      ),
    ).resolves.toMatchObject({
      priceUsed: 20252,
      productName: "Sony PlayStation 3 Slim - Gris",
    });

    expect(mockedGet.mock.calls.length).toBe(httpAfterMeta);
  });

  it("réutilise le HTML fiche après enrich gallery (0 GET extra)", async () => {
    const productUrl =
      "https://www.backmarket.fr/fr-fr/p/console-nintendo-2ds-2go-noirbleu/6edd4848-1dec-4060-bb16-fe0c3b9e7df2";
    const pdpHtml = fixture("2ds-bleu-product.html");

    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: pdpHtml,
    } as never);

    await enrichBackMarketProductGallery({
      title: "Nintendo 2DS - Bleu",
      priceCents: 16570,
      currency: "EUR",
      sourceUrl: productUrl,
      coverUrl: "https://example.com/thumb.jpg",
    });
    const httpAfterEnrich = mockedGet.mock.calls.length;

    await expect(
      fetchFromBackMarketProductUrl(productUrl, ["Nintendo 2DS - Bleu"], {
        shelfType: "hardware",
      }),
    ).resolves.toMatchObject({
      title: "Nintendo 2DS - Bleu",
      priceCents: 16570,
    });

    expect(mockedGet.mock.calls.length).toBe(httpAfterEnrich);
  });

  it("returns null when no listing shares hardware identity", async () => {
    mockedGet.mockResolvedValue({
      status: 200,
      data: fixture("wii-bleu-search.html"),
    } as never);

    await expect(
      fetchPricesFromBackMarket("PlayStation 5 Slim", ["PlayStation 5 Slim"], {
        shelfType: "hardware",
      }),
    ).resolves.toBeNull();
  });
});
