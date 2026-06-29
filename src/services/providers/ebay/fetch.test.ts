import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
import axios from "axios";

import {
  fetchFromEbay,
  fetchPricesFromEbay,
  pingEbay,
  resetEbayTokenCache,
} from "./fetch";

const mockedGet = vi.mocked(axios.get);
const mockedPost = vi.mocked(axios.post);

function tokenResponse(token = "tok-123", expiresIn = 7200) {
  return {
    status: 200,
    data: { access_token: token, expires_in: expiresIn, token_type: "Application Access Token" },
  } as never;
}

function searchResponse(items: unknown[]) {
  return { status: 200, data: { total: items.length, itemSummaries: items } } as never;
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
  it("resolves a barcode via the Browse GTIN search", async () => {
    mockedPost.mockResolvedValueOnce(tokenResponse());
    mockedGet.mockResolvedValueOnce(
      searchResponse([
        itemSummary("Mario Kart Wii (Nintendo Wii)", {
          img: "https://i.ebayimg.com/mkwii.jpg",
        }),
      ]),
    );

    await expect(fetchFromEbay("0045496365226")).resolves.toEqual([
      {
        name: "Mario Kart Wii (Nintendo Wii)",
        coverUrl: "https://i.ebayimg.com/mkwii.jpg",
      },
    ]);

    const [, config] = mockedGet.mock.calls[0]!;
    expect((config as { params: Record<string, string> }).params.gtin).toBe(
      "0045496365226",
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
    mockedPost.mockResolvedValueOnce(tokenResponse());
    mockedGet.mockResolvedValueOnce(
      searchResponse([
        itemSummary("Some Unrelated Phone Case"),
        itemSummary("The Last of Us Part I PS5"),
      ]),
    );

    await expect(
      fetchFromEbay("0711719541028", ["The Last of Us Part I"]),
    ).resolves.toEqual([
      {
        name: "The Last of Us Part I PS5",
        coverUrl: "https://i.ebayimg.com/x.jpg",
      },
    ]);
  });

  it("reuses the cached OAuth token across calls", async () => {
    mockedPost.mockResolvedValueOnce(tokenResponse());
    mockedGet
      .mockResolvedValueOnce(searchResponse([itemSummary("A")]))
      .mockResolvedValueOnce(searchResponse([itemSummary("B")]));

    await fetchFromEbay("0000000000001");
    await fetchFromEbay("0000000000002");

    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});

describe("fetchPricesFromEbay", () => {
  it("separates new and used median prices", async () => {
    mockedPost.mockResolvedValueOnce(tokenResponse());
    mockedGet.mockResolvedValueOnce(
      searchResponse([
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
    mockedGet.mockResolvedValueOnce(searchResponse([]));
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
});
