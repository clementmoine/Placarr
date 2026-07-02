import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
import axios from "axios";

import { fetchFromEbayCatalog } from "./catalog";
import {
  fetchFromEbay,
  fetchPricesFromEbay,
  pingEbay,
} from "./fetch";
import { resetEbayTokenCache } from "./oauth";

const mockedGet = vi.mocked(axios.get);
const mockedPost = vi.mocked(axios.post);

function tokenResponse(token = "tok-123", expiresIn = 7200) {
  return {
    status: 200,
    data: { access_token: token, expires_in: expiresIn, token_type: "Application Access Token" },
  } as never;
}

function browseResponse(items: unknown[]) {
  return { status: 200, data: { total: items.length, itemSummaries: items } } as never;
}

function catalogResponse(summaries: unknown[]) {
  return {
    status: 200,
    data: { productSummaries: summaries },
  } as never;
}

function itemSummary(
  title: string,
  opts: { price?: string; currency?: string; condition?: string; img?: string; url?: string } = {},
) {
  return {
    itemId: "v1|123|0",
    title,
    image: { imageUrl: opts.img ?? "https://i.ebayimg.com/x.jpg" },
    price: { value: opts.price ?? "29.99", currency: opts.currency ?? "EUR" },
    condition: opts.condition ?? "New",
    itemWebUrl: opts.url ?? "https://www.ebay.fr/itm/123",
  };
}

function mockCatalogThenBrowse(
  catalog: unknown[],
  browse: unknown[],
) {
  mockedPost
    .mockResolvedValueOnce(tokenResponse())
    .mockResolvedValueOnce(tokenResponse());
  mockedGet
    .mockResolvedValueOnce(catalogResponse(catalog))
    .mockResolvedValueOnce(browseResponse(browse));
}

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
  resetEbayTokenCache();
  process.env.EBAY_CLIENT_ID = "id";
  process.env.EBAY_CLIENT_SECRET = "secret";
});

afterEach(() => {
  delete process.env.EBAY_CLIENT_ID;
  delete process.env.EBAY_CLIENT_SECRET;
  delete process.env.EBAY_MARKETPLACE_ID;
});

describe("fetchFromEbay", () => {
  it("merges catalog GTIN hits with Browse listings", async () => {
    mockCatalogThenBrowse(
      [
        {
          epid: "999",
          title: "1984",
          image: { imageUrl: "https://i.ebayimg.com/catalog.jpg" },
        },
      ],
      [
        itemSummary("1984 - Occasion", {
          img: "https://i.ebayimg.com/listing.jpg",
        }),
      ],
    );

    await expect(fetchFromEbay("9782070368228")).resolves.toEqual([
      {
        name: "1984",
        coverUrl: "https://i.ebayimg.com/catalog.jpg",
        epid: "999",
        brand: null,
        catalog: true,
      },
      {
        name: "1984 - Occasion",
        coverUrl: "https://i.ebayimg.com/listing.jpg",
        catalog: false,
      },
    ]);
  });

  it("falls back to Browse ePID when GTIN listings are empty", async () => {
    mockedPost
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(tokenResponse());
    mockedGet
      .mockResolvedValueOnce(
        catalogResponse([
          {
            epid: "555",
            title: "Mario Kart Wii",
            image: { imageUrl: "https://i.ebayimg.com/mkwii.jpg" },
          },
        ]),
      )
      .mockResolvedValueOnce(browseResponse([]))
      .mockResolvedValueOnce(
        browseResponse([
          itemSummary("Mario Kart Wii (Nintendo Wii)", {
            img: "https://i.ebayimg.com/listing-mk.jpg",
          }),
        ]),
      );

    await expect(fetchFromEbay("0045496365226")).resolves.toEqual([
      expect.objectContaining({
        name: "Mario Kart Wii",
        catalog: true,
        epid: "555",
      }),
      expect.objectContaining({
        name: "Mario Kart Wii (Nintendo Wii)",
        catalog: false,
      }),
    ]);

    const epidCall = mockedGet.mock.calls[2]!;
    expect((epidCall[1] as { params: Record<string, string> }).params.epid).toBe(
      "555",
    );
  });

  it("returns [] without credentials (never calls the API)", async () => {
    delete process.env.EBAY_CLIENT_ID;
    delete process.env.EBAY_CLIENT_SECRET;
    await expect(fetchFromEbay("0045496365226")).resolves.toEqual([]);
    expect(mockedPost).not.toHaveBeenCalled();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("filters listings that do not match the expected title", async () => {
    mockCatalogThenBrowse(
      [],
      [
        itemSummary("Some Unrelated Phone Case"),
        itemSummary("The Last of Us Part I PS5"),
      ],
    );

    await expect(
      fetchFromEbay("0711719541028", ["The Last of Us Part I"]),
    ).resolves.toEqual([
      {
        name: "The Last of Us Part I PS5",
        coverUrl: "https://i.ebayimg.com/x.jpg",
        catalog: false,
      },
    ]);
  });

  it("reuses the cached OAuth token across calls", async () => {
    mockedPost
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(tokenResponse());
    mockedGet
      .mockResolvedValueOnce(catalogResponse([]))
      .mockResolvedValueOnce(browseResponse([itemSummary("A")]));

    await fetchFromEbay("0000000000001");

    mockedGet
      .mockResolvedValueOnce(catalogResponse([]))
      .mockResolvedValueOnce(browseResponse([itemSummary("B")]));

    await fetchFromEbay("0000000000002");

    expect(mockedPost).toHaveBeenCalledTimes(2);
    expect(mockedGet).toHaveBeenCalledTimes(4);
  });
});

describe("fetchPricesFromEbay", () => {
  it("separates new and used median prices", async () => {
    mockedPost.mockResolvedValueOnce(tokenResponse());
    mockedGet.mockResolvedValueOnce(
      browseResponse([
        itemSummary("Hades Switch", { price: "30.00", condition: "New" }),
        itemSummary("Hades Switch", { price: "20.00", condition: "Used" }),
        itemSummary("Hades Switch", { price: "24.00", condition: "Used" }),
      ]),
    );

    await expect(
      fetchPricesFromEbay("0045496365226", []),
    ).resolves.toMatchObject({
      priceNew: 3000,
      priceUsed: 2200,
      offerCount: 3,
    });
  });

  it("returns null when no priced listing matches", async () => {
    mockedPost.mockResolvedValueOnce(tokenResponse());
    mockedGet.mockResolvedValueOnce(browseResponse([]));
    await expect(fetchPricesFromEbay("0045496365226", [])).resolves.toBeNull();
  });
});

describe("pingEbay", () => {
  it("is unconfigured without credentials", async () => {
    delete process.env.EBAY_CLIENT_ID;
    const result = await pingEbay();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/credentials missing/i);
  });

  it("is ok when the OAuth token is issued", async () => {
    mockedPost.mockResolvedValueOnce(tokenResponse());
    const result = await pingEbay();
    expect(result.ok).toBe(true);
  });

  it("requests Browse + Catalog OAuth scopes for catalog calls", async () => {
    mockedPost
      .mockResolvedValueOnce({
        status: 400,
        data: { error: "invalid_scope" },
      } as never)
      .mockResolvedValueOnce(tokenResponse());
    mockedGet.mockResolvedValueOnce(
      catalogResponse([
        {
          epid: "1",
          title: "1984",
          image: { imageUrl: "https://i.ebayimg.com/1984.jpg" },
        },
      ]),
    );

    await fetchFromEbayCatalog("9782070368228");

    const bodies = mockedPost.mock.calls.map((call) => String(call[1]));
    expect(bodies.some((body) => body.includes("commerce.catalog.readonly"))).toBe(
      true,
    );
  });
});
