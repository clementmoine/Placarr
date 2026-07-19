import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({
  default: { get: vi.fn(), isAxiosError: vi.fn() },
}));
import axios from "axios";

import {
  isPriceChartingQuotaBlocked,
  resetPriceChartingQuotaBlockForTests,
} from "./quota";

import {
  decodePriceChartingHtmlEntities,
  fetchMetadataFromPriceCharting,
  fetchMetadataFromPriceChartingByName,
  fetchPricesFromPriceCharting,
  parsePriceChartingDetailHtml,
  parsePriceChartingGalleryImages,
  parsePriceChartingSearchRowsForTests,
  pickBestPriceChartingSearchRowForTests,
  priceChartingPlatformMatchesTarget,
  upgradePriceChartingImageUrl,
} from "./fetch";

const mockedGet = vi.mocked(axios.get);

const DETAIL_HTML = `
<html>
  <head>
    <link rel="canonical" href="https://www.pricecharting.com/game/wii/super-monkey-ball" />
  </head>
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
    status: 200,
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
  resetPriceChartingQuotaBlockForTests();
  vi.mocked(axios.isAxiosError).mockReturnValue(false);
});

describe("parsePriceChartingSearchRows + pickBestRow", () => {
  it("parses the modern search markup and fuzzy-matches Pro Skater 4 → Tony Hawk 4", () => {
    const html = `
      <table>
        <tr id="product-45633" data-product="45633">
          <td class="title">
            <a href="https://www.pricecharting.com/game/pal-gamecube/tony-hawk-4">Tony Hawk 4</a>
            <div class="console-in-title"><a href="/console/pal-gamecube">PAL Gamecube</a></div>
          </td>
        </tr>
        <tr id="product-8756608" data-product="8756608">
          <td class="title">
            <a href="https://www.pricecharting.com/game/xbox-series-x/tony-hawk%27s-pro-skater-3-%2B-4">Tony Hawk&#39;s Pro Skater 3 + 4</a>
            <div class="console-in-title"><a href="/console/xbox-series-x">Xbox Series X</a></div>
          </td>
        </tr>
        <tr id="product-49450" data-product="49450">
          <td class="title">
            <a href="https://www.pricecharting.com/game/pal-playstation/tony-hawk-4">Tony Hawk 4</a>
            <div class="console-in-title"><a href="/console/pal-playstation">PAL Playstation</a></div>
          </td>
        </tr>
        <tr id="product-68401" data-product="68401">
          <td class="title">
            <a href="https://www.pricecharting.com/game/pal-playstation/tony-hawk-4-platinum">Tony Hawk 4 [Platinum]</a>
            <div class="console-in-title"><a href="/console/pal-playstation">PAL Playstation</a></div>
          </td>
        </tr>
      </table>
    `;

    const rows = parsePriceChartingSearchRowsForTests(html);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "49450",
          title: "Tony Hawk 4",
          platform: "PAL Playstation",
          gamePath:
            "https://www.pricecharting.com/game/pal-playstation/tony-hawk-4",
        }),
      ]),
    );

    const best = pickBestPriceChartingSearchRowForTests(
      rows,
      "Tony Hawk's Pro Skater 4",
      "PlayStation 1",
      true,
    );
    expect(best?.gamePath).toContain("/pal-playstation/tony-hawk-4");
    expect(best?.title).toBe("Tony Hawk 4");
  });

  it("scores metadata aliases as alternate query titles", () => {
    const rows = [
      {
        id: "1",
        gamePath: "/game/pal-playstation/tony-hawk-4",
        title: "Tony Hawk 4",
        platform: "PAL Playstation",
      },
      {
        id: "2",
        gamePath: "/game/pal-playstation/unrelated",
        title: "Crash Bandicoot",
        platform: "PAL Playstation",
      },
    ];
    // Primary title alone would still match via synthetic variants; an explicit
    // alias must also be enough when the primary string is weak/noisy.
    expect(
      pickBestPriceChartingSearchRowForTests(
        rows,
        "THPS4 (disc only)",
        "PlayStation 1",
        true,
        false,
        ["Tony Hawk 4"],
      )?.title,
    ).toBe("Tony Hawk 4");
  });

  it("rejects wrong season year (Stars 2001 must not pick Stars 2000)", () => {
    const rows = [
      {
        id: "2000",
        gamePath: "/game/pal-playstation/bundesliga-stars-2000",
        title: "Bundesliga Stars 2000",
        platform: "PAL Playstation",
      },
      {
        id: "2001",
        gamePath: "/game/pal-playstation/bundesliga-stars-2001",
        title: "Bundesliga Stars 2001",
        platform: "PAL Playstation",
      },
    ];
    expect(
      pickBestPriceChartingSearchRowForTests(
        rows,
        "Bundesliga Stars 2001",
        "PlayStation 1",
        true,
      )?.title,
    ).toBe("Bundesliga Stars 2001");
    expect(
      pickBestPriceChartingSearchRowForTests(
        rows.filter((row) => row.id === "2000"),
        "LNF Stars 2001",
        "PlayStation 1",
        true,
        false,
        ["Bundesliga Stars 2001"],
      ),
    ).toBeNull();
  });
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
      url: "https://www.pricecharting.com/game/wii/super-monkey-ball",
      prices: {
        priceUsed: 1250,
        priceUsedCIB: 1800,
        priceNew: 2499,
        sourceUrl: "https://www.pricecharting.com/game/wii/super-monkey-ball",
        productName: "Super Monkey Ball",
      },
    });
  });

  it("ignore une fiche barcode redirigée vers une autre plateforme", async () => {
    mockedGet.mockResolvedValue({
      status: 200,
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

  it("renvoie null quand la recherche barcode reste vide sans fallback", async () => {
    mockedGet.mockResolvedValue({
      status: 200,
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

  it("résout une page de recherche barcode sans fallback via la première ligne NTSC", async () => {
    const searchHtml = `
      <html><body>Buy & Sell Search Results
        <tr class="offer" id="product-12345">
          <td class="product_name"><a href="/game/wii/mario-kart-wii">Mario Kart Wii</a><h2><br>Wii</h2></td>
        </tr>
      </body></html>`;

    mockedGet
      .mockResolvedValueOnce({
        data: searchHtml,
        request: {
          res: {
            responseUrl:
              "https://www.pricecharting.com/search-products?q=0045496365226",
          },
        },
      } as never)
      .mockResolvedValueOnce(detailResponse());

    await expect(
      fetchMetadataFromPriceCharting("0045496365226"),
    ).resolves.toMatchObject({
      title: "Super Monkey Ball",
      platform: "Wii",
      barcode: "0045496365226",
    });
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
        <link rel="canonical" href="https://www.pricecharting.com/game/ps4/borderlands-goty" />
        <h1>Borderlands [Game of the Year] <a>PlayStation 4</a></h1>
        <div class="cover"><img src='https://example.com/borderlands-goty.jpg'/></div>
      </body></html>`;

    mockedGet.mockImplementation(async (url: string) => {
      if (String(url).includes("/search-products")) {
        return {
          status: 200,
          data: searchHtml,
          request: {
            res: {
              responseUrl:
                "https://www.pricecharting.com/search-products?q=Borderlands+1",
            },
          },
        } as never;
      }
      if (String(url).includes("borderlands-goty")) {
        return {
          status: 200,
          data: gotyDetailHtml,
          request: {
            res: {
              responseUrl:
                "https://www.pricecharting.com/game/ps4/borderlands-goty",
            },
          },
        } as never;
      }
      // Direct slug guesses soft-404 to search.
      return {
        status: 200,
        data: searchHtml,
        request: {
          res: {
            responseUrl:
              "https://www.pricecharting.com/search-products?q=borderlands",
          },
        },
      } as never;
    });

    await expect(
      fetchMetadataFromPriceChartingByName(
        "Borderlands 1 - Game of the Year edition",
        "PlayStation 4",
        true,
      ),
    ).resolves.toMatchObject({
      title: "Borderlands [Game of the Year]",
      url: "https://www.pricecharting.com/game/ps4/borderlands-goty",
    });
  });

  it("résout un double pack slash via le slug ampersand PriceCharting", async () => {
    const haloDetailHtml = `
      <html><body>
        <h1>Halo Reach &amp; Fable 3 [Double Pack] <a>PAL Xbox 360</a></h1>
        <div class="cover"><img src='https://example.com/halo-fable.jpg'/></div>
        <div id="extra-images">
          <div class="extra">
            <div>
              <a href="https://storage.googleapis.com/images.pricecharting.com/abc/1600.jpg">
                <img src="https://storage.googleapis.com/images.pricecharting.com/abc/240.jpg" />
              </a>
            </div>
            <p>Main Image</p>
          </div>
          <div class="spacer">&nbsp;</div>
        </div>
        <div id="full-prices"></div>
      </body></html>`;

    mockedGet.mockResolvedValue({
      status: 200,
      data: haloDetailHtml,
      request: {
        res: {
          responseUrl:
            "https://www.pricecharting.com/game/pal-xbox-360/halo-reach-&-fable-3-double-pack",
        },
      },
    } as never);

    await expect(
      fetchMetadataFromPriceChartingByName(
        "Halo Reach / Fable III",
        "Xbox 360",
        true,
      ),
    ).resolves.toMatchObject({
      title: "Halo Reach & Fable 3 [Double Pack]",
      coverUrl:
        "https://storage.googleapis.com/images.pricecharting.com/abc/1600.jpg",
      images: [
        {
          url: "https://storage.googleapis.com/images.pricecharting.com/abc/1600.jpg",
          label: "Main Image",
        },
      ],
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
      sourceUrl: "https://www.pricecharting.com/game/wii/super-monkey-ball",
      productName: "Super Monkey Ball",
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
      sourceUrl: "https://www.pricecharting.com/game/wii/super-monkey-ball",
      productName: "Super Monkey Ball",
    });
  });

  it("falls back to NTSC when the PAL page has empty market prices", async () => {
    const palEmptyHtml = `
      <html><body>
        <h1>Millipede <a>PAL Atari 2600</a></h1>
        <script>VGPC.forex_rates = {"EUR": 1.0}</script>
        <td id="used_price"><span class="price js-price"> - </span></td>
        <td id="complete_price"><span class="price js-price"> - </span></td>
        <td id="new_price"><span class="price js-price"> - </span></td>
      </body></html>`;
    const ntscHtml = `
      <html>
        <head>
          <link rel="canonical" href="https://www.pricecharting.com/game/atari-2600/millipede" />
        </head>
        <body>
          <h1>Millipede <a>Atari 2600</a></h1>
          <script>VGPC.forex_rates = {"EUR": 1.0}</script>
          <td id="used_price"><span class="price js-price">$11.50</span></td>
          <td id="complete_price"><span class="price js-price">$20.00</span></td>
          <td id="new_price"><span class="price js-price">$39.99</span></td>
        </body>
      </html>`;

    mockedGet.mockImplementation(async (url: string) => {
      const href = String(url);
      if (href.includes("/pal-atari-2600/")) {
        return {
          status: 200,
          data: palEmptyHtml,
          request: {
            res: {
              responseUrl:
                "https://www.pricecharting.com/game/pal-atari-2600/millipede",
            },
          },
        } as never;
      }
      if (href.includes("/atari-2600/millipede")) {
        return {
          status: 200,
          data: ntscHtml,
          request: {
            res: {
              responseUrl:
                "https://www.pricecharting.com/game/atari-2600/millipede",
            },
          },
        } as never;
      }
      // Soft-404 search for other slug guesses.
      return {
        status: 200,
        data: "<html><body>Buy & Sell Search Results</body></html>",
        request: {
          res: {
            responseUrl:
              "https://www.pricecharting.com/search-products?q=Millipede",
          },
        },
      } as never;
    });

    await expect(
      fetchPricesFromPriceCharting("", ["Millipede"], "ATARI 2600", true),
    ).resolves.toEqual({
      priceUsed: 1150,
      priceUsedCIB: 2000,
      priceNew: 3999,
      sourceUrl: "https://www.pricecharting.com/game/atari-2600/millipede",
      productName: "Millipede",
    });
  });

  it("enters a module cooldown after HTTP 429 and skips further calls", async () => {
    vi.useFakeTimers();
    mockedGet.mockResolvedValue({ status: 429, data: "Too Many Requests" });

    const first = fetchPricesFromPriceCharting(
      "0045496365226",
      "Super Monkey Ball",
      "Wii",
    );
    await vi.runAllTimersAsync();
    await expect(first).resolves.toBeNull();
    expect(isPriceChartingQuotaBlocked()).toBe(true);

    mockedGet.mockClear();
    const second = fetchPricesFromPriceCharting(
      "5030917191690",
      "Mario",
      "Wii",
    );
    await vi.runAllTimersAsync();
    await expect(second).resolves.toBeNull();
    expect(mockedGet).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
