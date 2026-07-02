import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
import axios from "axios";

import { fetchFromEbayCatalog } from "./catalog";
import { resetEbayTokenCache } from "./oauth";

const mockedGet = vi.mocked(axios.get);
const mockedPost = vi.mocked(axios.post);

function tokenResponse(token = "tok-123", expiresIn = 7200) {
  return {
    status: 200,
    data: { access_token: token, expires_in: expiresIn, token_type: "Application Access Token" },
  } as never;
}

function catalogResponse(summaries: unknown[]) {
  return {
    status: 200,
    data: { productSummaries: summaries },
  } as never;
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

describe("fetchFromEbayCatalog", () => {
  it("maps catalog GTIN hits to canonical products", async () => {
    mockedPost.mockResolvedValueOnce(tokenResponse());
    mockedGet.mockResolvedValueOnce(
      catalogResponse([
        {
          epid: "1234567890",
          title: "1984",
          brand: "Gallimard",
          image: { imageUrl: "https://i.ebayimg.com/1984.jpg" },
        },
      ]),
    );

    await expect(fetchFromEbayCatalog("9782070368228")).resolves.toEqual([
      {
        name: "1984",
        coverUrl: "https://i.ebayimg.com/1984.jpg",
        epid: "1234567890",
        brand: "Gallimard",
        catalog: true,
      },
    ]);

    const [url, config] = mockedGet.mock.calls[0]!;
    expect(String(url)).toContain("/commerce/catalog/");
    expect((config as { params: Record<string, string> }).params.gtin).toBe(
      "9782070368228",
    );
  });

  it("filters catalog products that do not match the expected title", async () => {
    mockedPost.mockResolvedValueOnce(tokenResponse());
    mockedGet.mockResolvedValueOnce(
      catalogResponse([
        {
          epid: "1",
          title: "Wrong Book",
          image: { imageUrl: "https://i.ebayimg.com/wrong.jpg" },
        },
        {
          epid: "2",
          title: "1984",
          image: { imageUrl: "https://i.ebayimg.com/1984.jpg" },
        },
      ]),
    );

    await expect(
      fetchFromEbayCatalog("9782070368228", ["1984"]),
    ).resolves.toEqual([
      expect.objectContaining({ name: "1984", catalog: true }),
    ]);
  });

  it("returns [] without credentials", async () => {
    delete process.env.EBAY_CLIENT_ID;
    await expect(fetchFromEbayCatalog("9782070368228")).resolves.toEqual([]);
    expect(mockedPost).not.toHaveBeenCalled();
  });
});
