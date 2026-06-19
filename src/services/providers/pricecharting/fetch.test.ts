import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn(), isAxiosError: vi.fn() } }));
import axios from "axios";

import {
  fetchMetadataFromPriceCharting,
  fetchPricesFromPriceCharting,
} from "./fetch";

const mockedGet = vi.mocked(axios.get);

const DETAIL_HTML = `
<html>
  <body>
    <h1>Super Monkey Ball <a>Wii</a></h1>
    <div class="cover"><img src='https://example.com/monkey.jpg'/></div>
    <div>PEGI 3</div>
    <tr itemprop="identifier">
      <td class="title">EAN / GTIN:</td>
      <td class="details">0045496365226</td>
    </tr>
    <script>VGPC.forex_rates = {"EUR": 1.0}</script>
    <span id="used_price"><span class="price js-price">$12.50</span></span>
    <span id="complete_price"><span class="price js-price">$18.00</span></span>
    <span id="new_price"><span class="price js-price">$24.99</span></span>
  </body>
</html>
`;

function detailResponse(html = DETAIL_HTML) {
  return {
    data: html,
    request: {
      res: {
        responseUrl: "https://www.pricecharting.com/game/wii/super-monkey-ball",
      },
    },
  } as never;
}

beforeEach(() => {
  mockedGet.mockReset();
});

describe("fetchMetadataFromPriceCharting", () => {
  it("parse titre, plateforme, jaquette et classification depuis une fiche directe", async () => {
    mockedGet.mockResolvedValue(detailResponse());

    await expect(
      fetchMetadataFromPriceCharting("0045496365226"),
    ).resolves.toEqual({
      title: "Super Monkey Ball",
      platform: "Wii",
      coverUrl: "https://example.com/monkey.jpg",
      ageRating: "PEGI 3",
      barcode: "0045496365226",
    });
  });

  it("renvoie null quand la recherche reste ambiguë sans fallback", async () => {
    mockedGet.mockResolvedValue({
      data: "<html>Buy & Sell Search Results</html>",
      request: {
        res: {
          responseUrl:
            "https://www.pricecharting.com/search-products?q=0045496365226",
        },
      },
    } as never);

    expect(await fetchMetadataFromPriceCharting("0045496365226")).toBeNull();
  });
});

describe("fetchPricesFromPriceCharting", () => {
  it("extrait les prix loose/CIB/new en centimes EUR", async () => {
    mockedGet.mockResolvedValue(detailResponse());

    await expect(
      fetchPricesFromPriceCharting("0045496365226"),
    ).resolves.toEqual({
      priceUsed: 1250,
      priceUsedCIB: 1800,
      priceNew: 2499,
    });
  });
});
