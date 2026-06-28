import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn(), isAxiosError: vi.fn() } }));
import axios from "axios";

import {
  decodePriceChartingHtmlEntities,
  fetchMetadataFromPriceCharting,
  fetchMetadataFromPriceChartingByName,
  fetchPricesFromPriceCharting,
  parsePriceChartingDetailHtml,
  parsePriceChartingGalleryImages,
  priceChartingPlatformMatchesTarget,
  upgradePriceChartingImageUrl,
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

describe("priceChartingPlatformMatchesTarget", () => {
  it("accepte une plateforme correspondante", () => {
    expect(
      priceChartingPlatformMatchesTarget("PlayStation 2", "PlayStation 2"),
    ).toBe(true);
    expect(
      priceChartingPlatformMatchesTarget("PAL Xbox", "Xbox Original"),
    ).toBe(true);
  });

  it("rejette une plateforme différente", () => {
    expect(
      priceChartingPlatformMatchesTarget("PAL Xbox", "PlayStation 2"),
    ).toBe(false);
  });
});

describe("decodePriceChartingHtmlEntities", () => {
  it("décode les entités HTML courantes", () => {
    expect(decodePriceChartingHtmlEntities("Assassin&#39;s Creed")).toBe(
      "Assassin's Creed",
    );
    expect(decodePriceChartingHtmlEntities("Tom &amp; Jerry")).toBe(
      "Tom & Jerry",
    );
  });
});

describe("upgradePriceChartingImageUrl", () => {
  it("upgrades PriceCharting CDN thumbnails to 1600px", () => {
    expect(
      upgradePriceChartingImageUrl(
        "https://storage.googleapis.com/images.pricecharting.com/4fwej2lejxesbe3m/240.jpg",
      ),
    ).toBe(
      "https://storage.googleapis.com/images.pricecharting.com/4fwej2lejxesbe3m/1600.jpg",
    );
  });
});

describe("parsePriceChartingGalleryImages", () => {
  it("extracts full-resolution gallery photos from the #images section", () => {
    const html = `
      <div id="extra-images">
        <div class="extra">
          <div>
            <a href="https://storage.googleapis.com/images.pricecharting.com/abc/1600.jpg">
              <img src="https://storage.googleapis.com/images.pricecharting.com/abc/240.jpg" />
            </a>
          </div>
          <p>Main Image</p>
        </div>
        <div class="extra">
          <div>
            <a href="https://storage.googleapis.com/images.pricecharting.com/def/1600.jpg">
              <img src="https://storage.googleapis.com/images.pricecharting.com/def/240.jpg" />
            </a>
          </div>
          <p>Cart</p>
        </div>
        <div class="spacer">&nbsp;</div>
      </div>
      <div id="full-prices"></div>
    `;

    expect(parsePriceChartingGalleryImages(html)).toEqual([
      {
        url: "https://storage.googleapis.com/images.pricecharting.com/abc/1600.jpg",
        label: "Main Image",
      },
      {
        url: "https://storage.googleapis.com/images.pricecharting.com/def/1600.jpg",
        label: "Cart",
      },
    ]);
  });
});

describe("parsePriceChartingDetailHtml", () => {
  it("prefers max-resolution cover and gallery images over the 240px thumbnail", () => {
    expect(
      parsePriceChartingDetailHtml(`
        <h1>Mario Kart 8 Deluxe <a>Nintendo Switch</a></h1>
        <div class="cover">
          <img src='https://storage.googleapis.com/images.pricecharting.com/abc/240.jpg' />
        </div>
        <div id="extra-images">
          <div class="extra">
            <div>
              <a href="https://storage.googleapis.com/images.pricecharting.com/abc/1600.jpg">
                <img src="https://storage.googleapis.com/images.pricecharting.com/abc/240.jpg" />
              </a>
            </div>
            <p>Main Image</p>
          </div>
          <div class="extra">
            <div>
              <a href="https://storage.googleapis.com/images.pricecharting.com/def/1600.jpg">
                <img src="https://storage.googleapis.com/images.pricecharting.com/def/240.jpg" />
              </a>
            </div>
            <p>Full Art</p>
          </div>
          <div class="spacer">&nbsp;</div>
        </div>
        <div id="full-prices"></div>
      `),
    ).toEqual({
      title: "Mario Kart 8 Deluxe",
      platform: "Nintendo Switch",
      coverUrl:
        "https://storage.googleapis.com/images.pricecharting.com/abc/1600.jpg",
      images: [
        {
          url: "https://storage.googleapis.com/images.pricecharting.com/abc/1600.jpg",
          label: "Main Image",
        },
        {
          url: "https://storage.googleapis.com/images.pricecharting.com/def/1600.jpg",
          label: "Full Art",
        },
      ],
    });
  });

  it("drops community fan-art gallery labels such as Foxigami", () => {
    expect(
      parsePriceChartingDetailHtml(`
        <h1>Endling: Extinction is Forever <a>PlayStation 4</a></h1>
        <div class="cover">
          <img src='https://storage.googleapis.com/images.pricecharting.com/main/240.jpg' />
        </div>
        <div id="extra-images">
          <div class="extra">
            <div>
              <a href="https://storage.googleapis.com/images.pricecharting.com/main/1600.jpg">
                <img src="https://storage.googleapis.com/images.pricecharting.com/main/240.jpg" />
              </a>
            </div>
            <p>Main Image</p>
          </div>
          <div class="extra">
            <div>
              <a href="https://storage.googleapis.com/images.pricecharting.com/fox/1600.jpg">
                <img src="https://storage.googleapis.com/images.pricecharting.com/fox/240.jpg" />
              </a>
            </div>
            <p>Foxigami</p>
          </div>
        </div>
        <div id="full-prices"></div>
      `),
    ).toEqual({
      title: "Endling: Extinction is Forever",
      platform: "PlayStation 4",
      coverUrl:
        "https://storage.googleapis.com/images.pricecharting.com/main/1600.jpg",
      images: [
        {
          url: "https://storage.googleapis.com/images.pricecharting.com/main/1600.jpg",
          label: "Main Image",
        },
      ],
    });
  });

  it("décode les entités HTML dans le titre", () => {
    expect(
      parsePriceChartingDetailHtml(
        "<html><body><h1>Assassin&#39;s Creed <a>PAL Xbox 360</a></h1></body></html>",
      ),
    ).toEqual({
      title: "Assassin's Creed",
      platform: "PAL Xbox 360",
    });
  });
});

describe("fetchMetadataFromPriceCharting", () => {
  it("parse titre, plateforme, jaquette, classification et prix depuis une fiche directe", async () => {
    mockedGet.mockResolvedValue(detailResponse());

    // La même requête HTML sert à l'identification et aux prix : un seul appel
    // provider doit ramener les deux.
    await expect(
      fetchMetadataFromPriceCharting("0045496365226"),
    ).resolves.toEqual({
      title: "Super Monkey Ball",
      platform: "Wii",
      coverUrl: "https://example.com/monkey.jpg",
      ageRating: "PEGI 3",
      barcode: "0045496365226",
      prices: {
        priceUsed: 1250,
        priceUsedCIB: 1800,
        priceNew: 2499,
      },
    });
  });

  it("ignore une fiche barcode redirigée vers une autre plateforme", async () => {
    mockedGet.mockResolvedValue({
      data: `<html><body><h1>Club Football 2005 <a>PAL Xbox</a></h1></body></html>`,
      request: {
        res: {
          responseUrl:
            "https://www.pricecharting.com/game/pal-xbox/club-football-2005-olympique-de-marseille",
        },
      },
    } as never);

    expect(
      await fetchMetadataFromPriceCharting(
        "0045496365226",
        "Club Football 2005 Olympique de Marseille",
        "PlayStation 2",
      ),
    ).toBeNull();
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

  it("prefers Borderlands GOTY over Borderlands 3 on PS4 search", async () => {
    const searchHtml = `
      <html><body>Buy & Sell Search Results
        <tr class="offer" id="product-99999">
          <td class="product_name"><a href="/game/ps4/borderlands-3">Borderlands 3 [Deluxe Edition]</a><h2><br>PlayStation 4</h2></td>
        </tr>
        <tr class="offer" id="product-88888">
          <td class="product_name"><a href="/game/ps4/borderlands-goty">Borderlands [Game of the Year]</a><h2><br>PlayStation 4</h2></td>
        </tr>
      </body></html>`;
    const gotyDetailHtml = `
      <html><body>
        <h1>Borderlands [Game of the Year] <a>PlayStation 4</a></h1>
        <div class="cover"><img src='https://example.com/borderlands-goty.jpg'/></div>
      </body></html>`;

    mockedGet
      .mockResolvedValueOnce({
        data: searchHtml,
        request: {
          res: {
            responseUrl:
              "https://www.pricecharting.com/search-products?q=Borderlands+1",
          },
        },
      } as never)
      .mockResolvedValueOnce({
        data: gotyDetailHtml,
        request: {
          res: {
            responseUrl:
              "https://www.pricecharting.com/game/ps4/borderlands-goty",
          },
        },
      } as never);

    await expect(
      fetchMetadataFromPriceChartingByName(
        "Borderlands 1 - Game of the Year edition",
        "PlayStation 4",
        true,
      ),
    ).resolves.toMatchObject({
      title: "Borderlands [Game of the Year]",
    });
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

  it("accepte une recherche par titre sans barcode", async () => {
    mockedGet.mockResolvedValue(detailResponse());

    await expect(
      fetchPricesFromPriceCharting("", ["Super Monkey Ball"], "Wii", true),
    ).resolves.toEqual({
      priceUsed: 1250,
      priceUsedCIB: 1800,
      priceNew: 2499,
    });
  });
});
