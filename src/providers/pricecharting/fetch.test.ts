import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({
  default: { get: vi.fn(), isAxiosError: vi.fn() },
}));

const readPriceChartingPriceEvidence = vi.fn();
const promotePriceChartingPriceEvidence = vi.fn();
const readPriceChartingSearchEvidence = vi.fn();
const promotePriceChartingSearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  readPriceChartingPriceEvidence: (...args: unknown[]) =>
    readPriceChartingPriceEvidence(...args),
  promotePriceChartingPriceEvidence: (...args: unknown[]) =>
    promotePriceChartingPriceEvidence(...args),
  readPriceChartingSearchEvidence: (...args: unknown[]) =>
    readPriceChartingSearchEvidence(...args),
  promotePriceChartingSearchEvidence: (...args: unknown[]) =>
    promotePriceChartingSearchEvidence(...args),
}));

import axios from "axios";

import {
  isPriceChartingQuotaBlocked,
  resetPriceChartingQuotaBlockForTests,
} from "./quota";

import {
  decodePriceChartingHtmlEntities,
  enrichPriceChartingMetadataWithSiblingRegion,
  expandPriceChartingHardwareSiblingProductSlugs,
  fetchMetadataFromPriceCharting,
  fetchMetadataFromPriceChartingByName,
  fetchPricesFromPriceCharting,
  fetchPricesFromPriceChartingGameUrl,
  parsePriceChartingDetailHtml,
  parsePriceChartingGalleryImages,
  parsePriceChartingSearchRowsForTests,
  pickBestPriceChartingSearchRowForTests,
  priceChartingPlatformMatchesTarget,
  priceChartingSiblingRegionUrl,
  resolvePriceChartingGamePathForTests,
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
  readPriceChartingPriceEvidence.mockReset();
  promotePriceChartingPriceEvidence.mockReset();
  readPriceChartingSearchEvidence.mockReset();
  promotePriceChartingSearchEvidence.mockReset();
  readPriceChartingPriceEvidence.mockResolvedValue(null);
  promotePriceChartingPriceEvidence.mockResolvedValue(undefined);
  readPriceChartingSearchEvidence.mockResolvedValue(null);
  promotePriceChartingSearchEvidence.mockResolvedValue(undefined);
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

  it("prefers Switch OLED console over Zelda game on hardware seeks", () => {
    const rows = [
      {
        id: "nes",
        gamePath: "/game/pal-nes/legend-of-zelda",
        title: "The Legend of Zelda",
        platform: "PAL NES",
      },
      {
        id: "oled",
        gamePath: "/game/nintendo-switch/nintendo-switch-oled-model",
        title: "Nintendo Switch OLED Model",
        platform: "Nintendo Switch",
      },
    ];
    const best = pickBestPriceChartingSearchRowForTests(
      rows,
      "Nintendo Switch OLED Édition The Legend of Zelda",
      "Nintendo Switch",
      false,
      false,
      [],
      { mediaType: "hardware" },
    );
    expect(best?.id).toBe("oled");
  });

  it("prefers Vita System over Vita game hits on hardware seeks", () => {
    const rows = [
      {
        id: "game",
        gamePath: "/game/playstation-vita/uncharted-golden-abyss",
        title: "Uncharted: Golden Abyss",
        platform: "Playstation Vita",
      },
      {
        id: "slim",
        gamePath: "/game/playstation-vita/playstation-vita-slim-console",
        title: "PlayStation Vita Slim Console",
        platform: "Playstation Vita",
      },
      {
        id: "system",
        gamePath: "/game/playstation-vita/playstation-vita-system",
        title: "PlayStation Vita System",
        platform: "Playstation Vita",
      },
    ];
    const best = pickBestPriceChartingSearchRowForTests(
      rows,
      "PlayStation Vita",
      "PlayStation Vita",
      false,
      false,
      [],
      { mediaType: "hardware" },
    );
    expect(best?.id).toBe("system");
  });

  it("picks Slim Console 250GB over 4GB for shelf 250Go", () => {
    const rows = [
      {
        id: "4gb",
        gamePath: "/game/xbox-360/xbox-360-slim-console-4gb",
        title: "Xbox 360 Slim Console 4GB",
        platform: "Xbox 360",
      },
      {
        id: "250",
        gamePath: "/game/xbox-360/xbox-360-slim-console-250gb",
        title: "Xbox 360 Slim Console 250GB",
        platform: "Xbox 360",
      },
    ];
    const best = pickBestPriceChartingSearchRowForTests(
      rows,
      "Xbox 360 Slim 250Go",
      "Xbox 360",
      false,
      false,
      [],
      { mediaType: "hardware" },
    );
    expect(best?.id).toBe("250");
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

describe("priceChartingSiblingRegionUrl", () => {
  it("toggles PAL ↔ NTSC for the same catalog slug", () => {
    expect(
      priceChartingSiblingRegionUrl(
        "https://www.pricecharting.com/game/pal-playstation-vita/playstation-tv",
      ),
    ).toBe(
      "https://www.pricecharting.com/game/playstation-vita/playstation-tv",
    );
    expect(
      priceChartingSiblingRegionUrl(
        "https://www.pricecharting.com/game/playstation-vita/playstation-tv",
      ),
    ).toBe(
      "https://www.pricecharting.com/game/pal-playstation-vita/playstation-tv",
    );
  });
});

describe("expandPriceChartingHardwareSiblingProductSlugs", () => {
  it("adds -system/-console when the primary slug omits catalog chrome", () => {
    expect(
      expandPriceChartingHardwareSiblingProductSlugs(
        "playstation-3-500gb-super-slim",
      ),
    ).toEqual(
      expect.arrayContaining([
        "playstation-3-500gb-super-slim",
        "playstation-3-500gb-super-slim-system",
        "playstation-3-500gb-super-slim-console",
      ]),
    );
  });

  it("also tries the bare slug when primary already has -system", () => {
    expect(
      expandPriceChartingHardwareSiblingProductSlugs(
        "playstation-3-500gb-super-slim-system",
      ),
    ).toEqual(
      expect.arrayContaining([
        "playstation-3-500gb-super-slim-system",
        "playstation-3-500gb-super-slim",
      ]),
    );
  });

  it("reorders finish-rear PAL slugs to finish-front NTSC (DS Lite White)", () => {
    expect(
      expandPriceChartingHardwareSiblingProductSlugs("nintendo-ds-lite-white"),
    ).toEqual(
      expect.arrayContaining([
        "nintendo-ds-lite-white",
        "white-nintendo-ds-lite",
        "white-nintendo-ds-lite-system",
      ]),
    );
  });
});

describe("enrichPriceChartingMetadataWithSiblingRegion", () => {
  it("keeps PAL as primary url and stores the NTSC sibling fiche", async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (String(url).includes("/game/gamecube/black-gamecube-system")) {
        return {
          status: 200,
          data: `
            <html>
              <head>
                <link rel="canonical" href="https://www.pricecharting.com/game/gamecube/black-gamecube-system" />
              </head>
              <body>
                <h1>Black Gamecube System <a>Gamecube</a></h1>
                <div id="extra-images">
                  <div class="extra">
                    <div>
                      <a href="https://storage.googleapis.com/images.pricecharting.com/ntsc/1600.jpg">
                        <img src="https://storage.googleapis.com/images.pricecharting.com/ntsc/240.jpg" />
                      </a>
                    </div>
                    <p>Main Image</p>
                  </div>
                </div>
              </body>
            </html>
          `,
          request: {
            res: {
              responseUrl:
                "https://www.pricecharting.com/game/gamecube/black-gamecube-system",
            },
          },
        } as never;
      }
      throw new Error(`unexpected url ${url}`);
    });

    await expect(
      enrichPriceChartingMetadataWithSiblingRegion({
        title: "Black Gamecube System",
        platform: "PAL Gamecube",
        url: "https://www.pricecharting.com/game/pal-gamecube/black-gamecube-system",
        coverUrl:
          "https://storage.googleapis.com/images.pricecharting.com/pal/1600.jpg",
        images: [
          {
            url: "https://storage.googleapis.com/images.pricecharting.com/pal/1600.jpg",
            label: "Main Image",
          },
        ],
      }),
    ).resolves.toMatchObject({
      url: "https://www.pricecharting.com/game/pal-gamecube/black-gamecube-system",
      siblingUrl:
        "https://www.pricecharting.com/game/gamecube/black-gamecube-system",
      coverUrl:
        "https://storage.googleapis.com/images.pricecharting.com/pal/1600.jpg",
      images: [
        expect.objectContaining({
          url: "https://storage.googleapis.com/images.pricecharting.com/pal/1600.jpg",
          isPal: true,
        }),
      ],
    });
  });

  it("rescues NTSC sibling via title search when same-slug soft-404s", async () => {
    mockedGet.mockImplementation(async (url: string) => {
      const href = String(url);
      if (href.includes("/game/wii/wii-console-white")) {
        return {
          status: 200,
          data: `<html><body><h1>Wii Console White Prices</h1></body></html>`,
          request: {
            res: {
              responseUrl:
                "https://www.pricecharting.com/search-products?type=prices&q=wii+console+white",
            },
          },
        } as never;
      }
      if (
        href.includes("search-products") &&
        /White\+Wii\+System|White%20Wii%20System/i.test(href)
      ) {
        return {
          status: 200,
          data: `
            <table>
              <tr id="product-1" data-product="1">
                <td class="title">
                  <a href="https://www.pricecharting.com/game/wii/white-nintendo-wii-system">White Nintendo Wii System</a>
                  <div class="console-in-title"><a href="/console/wii">Wii</a></div>
                </td>
              </tr>
              <tr id="product-2" data-product="2">
                <td class="title">
                  <a href="https://www.pricecharting.com/game/wii/wii-nunchuk-white">Wii Nunchuk [White]</a>
                  <div class="console-in-title"><a href="/console/wii">Wii</a></div>
                </td>
              </tr>
            </table>
          `,
          request: {
            res: {
              responseUrl: href,
            },
          },
        } as never;
      }
      if (href.includes("/game/wii/white-nintendo-wii-system")) {
        return {
          status: 200,
          data: `
            <html>
              <head>
                <link rel="canonical" href="https://www.pricecharting.com/game/wii/white-nintendo-wii-system" />
              </head>
              <body>
                <h1>White Nintendo Wii System <a>Wii</a></h1>
              </body>
            </html>
          `,
          request: {
            res: {
              responseUrl:
                "https://www.pricecharting.com/game/wii/white-nintendo-wii-system",
            },
          },
        } as never;
      }
      throw new Error(`unexpected url ${url}`);
    });

    await expect(
      enrichPriceChartingMetadataWithSiblingRegion({
        title: "Wii Console White",
        platform: "PAL Wii",
        url: "https://www.pricecharting.com/game/pal-wii/wii-console-white",
      }),
    ).resolves.toMatchObject({
      url: "https://www.pricecharting.com/game/pal-wii/wii-console-white",
      siblingUrl:
        "https://www.pricecharting.com/game/wii/white-nintendo-wii-system",
    });
  });

  it("rescues NTSC finish-front sibling for PAL DS Lite White without landing on DSi", async () => {
    mockedGet.mockImplementation(async (url: string) => {
      const href = String(url);
      if (href.includes("/game/nintendo-ds/nintendo-ds-lite-white")) {
        return {
          status: 200,
          data: `<html><body><h1>Prices</h1></body></html>`,
          request: {
            res: {
              responseUrl:
                "https://www.pricecharting.com/search-products?type=prices&q=nintendo+ds+lite+white",
            },
          },
        } as never;
      }
      if (
        href.includes("/game/nintendo-ds/nintendo-ds-lite-white-system") ||
        href.includes("/game/nintendo-ds/nintendo-ds-lite-white-console")
      ) {
        return {
          status: 200,
          data: `<html><body><h1>Prices</h1></body></html>`,
          request: {
            res: {
              responseUrl:
                "https://www.pricecharting.com/search-products?type=prices&q=nintendo+ds+lite+white+system",
            },
          },
        } as never;
      }
      if (href.includes("/game/nintendo-ds/white-nintendo-ds-lite")) {
        return {
          status: 200,
          data: `
            <html>
              <head>
                <link rel="canonical" href="https://www.pricecharting.com/game/nintendo-ds/white-nintendo-ds-lite" />
              </head>
              <body>
                <h1>White Nintendo DS Lite <a>Nintendo DS</a></h1>
              </body>
            </html>
          `,
          request: {
            res: {
              responseUrl:
                "https://www.pricecharting.com/game/nintendo-ds/white-nintendo-ds-lite",
            },
          },
        } as never;
      }
      throw new Error(`unexpected url ${url}`);
    });

    await expect(
      enrichPriceChartingMetadataWithSiblingRegion(
        {
          title: "Nintendo DS Lite [White]",
          platform: "PAL Nintendo DS",
          url: "https://www.pricecharting.com/game/pal-nintendo-ds/nintendo-ds-lite-white",
        },
        { allowTitleSearchRescue: false },
      ),
    ).resolves.toMatchObject({
      url: "https://www.pricecharting.com/game/pal-nintendo-ds/nintendo-ds-lite-white",
      siblingUrl:
        "https://www.pricecharting.com/game/nintendo-ds/white-nintendo-ds-lite",
    });
  });

  it("merges Box Front/Back from NTSC -system when same-slug soft-404s", async () => {
    mockedGet.mockImplementation(async (url: string) => {
      const href = String(url);
      if (
        href.endsWith("/playstation-3-500gb-super-slim") ||
        href.includes("/playstation-3-500gb-super-slim?")
      ) {
        return {
          status: 200,
          data: `<html><body><h1>Prices</h1></body></html>`,
          request: {
            res: {
              responseUrl:
                "https://www.pricecharting.com/search-products?type=prices&q=playstation+3+500gb+super+slim",
            },
          },
        } as never;
      }
      if (href.includes("/playstation-3-500gb-super-slim-system")) {
        return {
          status: 200,
          data: `
            <html>
              <head>
                <link rel="canonical" href="https://www.pricecharting.com/game/playstation-3/playstation-3-500gb-super-slim-system" />
              </head>
              <body>
                <h1>Playstation 3 500GB Super Slim System <a>Playstation 3</a></h1>
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
                      <a href="https://storage.googleapis.com/images.pricecharting.com/front/1600.jpg">
                        <img src="https://storage.googleapis.com/images.pricecharting.com/front/240.jpg" />
                      </a>
                    </div>
                    <p>Box Front Art</p>
                  </div>
                  <div class="extra">
                    <div>
                      <a href="https://storage.googleapis.com/images.pricecharting.com/back/1600.jpg">
                        <img src="https://storage.googleapis.com/images.pricecharting.com/back/240.jpg" />
                      </a>
                    </div>
                    <p>Box Back Art</p>
                  </div>
                </div>
                <div id="full-prices"></div>
              </body>
            </html>
          `,
          request: {
            res: {
              responseUrl:
                "https://www.pricecharting.com/game/playstation-3/playstation-3-500gb-super-slim-system",
            },
          },
        } as never;
      }
      if (href.includes("/playstation-3-500gb-super-slim-console")) {
        return {
          status: 200,
          data: `<html><body><h1>Prices</h1></body></html>`,
          request: {
            res: {
              responseUrl:
                "https://www.pricecharting.com/search-products?type=prices&q=console",
            },
          },
        } as never;
      }
      throw new Error(`unexpected url ${url}`);
    });

    const result = await enrichPriceChartingMetadataWithSiblingRegion({
      title: "Playstation 3 500GB Super Slim",
      platform: "PAL Playstation 3",
      url: "https://www.pricecharting.com/game/pal-playstation-3/playstation-3-500gb-super-slim",
      coverUrl:
        "https://storage.googleapis.com/images.pricecharting.com/pal-main/1600.jpg",
      images: [
        {
          url: "https://storage.googleapis.com/images.pricecharting.com/pal-main/1600.jpg",
          label: "Main Image",
        },
      ],
    });

    expect(result.siblingUrl).toBe(
      "https://www.pricecharting.com/game/playstation-3/playstation-3-500gb-super-slim-system",
    );
    expect(result.images?.map((image) => image.label)).toEqual([
      "Main Image",
      "Main Image",
      "Box Front Art",
      "Box Back Art",
    ]);
  });
});

describe("parsePriceChartingDetailHtml", () => {
  it("rejects search-results chrome that is not a product fiche", () => {
    expect(
      parsePriceChartingDetailHtml(`
        <html><body>
          <h1>Items matching your search: <i>045496883041</i></h1>
          <div>Buy & Sell Search Results</div>
        </body></html>
      `),
    ).toBeNull();
  });

  it("decodes HTML entities in Game & Watch platform chrome", () => {
    expect(
      parsePriceChartingDetailHtml(`
        <h1>Super Mario Bros <a href="/console/game-&amp;-watch">Game &amp; Watch</a></h1>
        <div class="cover">
          <img src='https://storage.googleapis.com/images.pricecharting.com/gw/240.jpg' />
        </div>
        <div id="extra-images">
          <div class="extra">
            <div>
              <a href="https://storage.googleapis.com/images.pricecharting.com/gw/1600.jpg">
                <img src="https://storage.googleapis.com/images.pricecharting.com/gw/240.jpg" />
              </a>
            </div>
            <p>Main Image</p>
          </div>
        </div>
        <div id="full-prices"></div>
      `),
    ).toMatchObject({
      title: "Super Mario Bros",
      platform: "Game & Watch",
      coverUrl:
        "https://storage.googleapis.com/images.pricecharting.com/gw/1600.jpg",
    });
  });

  it("strips trailing Prices chrome from hardware h1 titles without platform links", () => {
    expect(
      parsePriceChartingDetailHtml(`
        <h1>Psone System Prices</h1>
        <div id="extra-images"></div>
        <div id="full-prices"></div>
      `)?.title,
    ).toBe("Psone System");
  });

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

  it("keeps every #images gallery photo, including unlabeled community uploads", () => {
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
          <div class="extra">
            <div>
              <a href="https://storage.googleapis.com/images.pricecharting.com/bundle/1600.jpg">
                <img src="https://storage.googleapis.com/images.pricecharting.com/bundle/240.jpg" />
              </a>
            </div>
            <p>Forza Motorsport Bundle</p>
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
        {
          url: "https://storage.googleapis.com/images.pricecharting.com/fox/1600.jpg",
          label: "Foxigami",
        },
        {
          url: "https://storage.googleapis.com/images.pricecharting.com/bundle/1600.jpg",
          label: "Forza Motorsport Bundle",
        },
      ],
    });
  });

  it("keeps Box View / Back / Console gallery photos (hardware catalog chrome)", () => {
    expect(
      parsePriceChartingDetailHtml(`
        <h1>PlayStation 4 Pro <a>PlayStation 4</a></h1>
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
              <a href="https://storage.googleapis.com/images.pricecharting.com/box/1600.jpg">
                <img src="https://storage.googleapis.com/images.pricecharting.com/box/240.jpg" />
              </a>
            </div>
            <p>Box View</p>
          </div>
          <div class="extra">
            <div>
              <a href="https://storage.googleapis.com/images.pricecharting.com/back/1600.jpg">
                <img src="https://storage.googleapis.com/images.pricecharting.com/back/240.jpg" />
              </a>
            </div>
            <p>Back</p>
          </div>
          <div class="extra">
            <div>
              <a href="https://storage.googleapis.com/images.pricecharting.com/console/1600.jpg">
                <img src="https://storage.googleapis.com/images.pricecharting.com/console/240.jpg" />
              </a>
            </div>
            <p>Console</p>
          </div>
          <div class="extra">
            <div>
              <a href="https://storage.googleapis.com/images.pricecharting.com/system-only/1600.jpg">
                <img src="https://storage.googleapis.com/images.pricecharting.com/system-only/240.jpg" />
              </a>
            </div>
            <p>System Only</p>
          </div>
        </div>
        <div id="full-prices"></div>
      `)?.images?.map((image) => image.label),
    ).toEqual(["Main Image", "Box View", "Back", "Console", "System Only"]);
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

  it("searches before inventing /game/ slugs on name seek", async () => {
    const searchHtml = `
      <html><body>Buy & Sell Search Results
        <tr class="offer" id="product-1">
          <td class="product_name"><a href="/game/pal-wii-u/wii-u-console-deluxe-black-32gb">Wii U Console Deluxe Black 32GB</a><h2><br>PAL Wii U</h2></td>
        </tr>
      </body></html>`;
    const detailHtml = `
      <html><body>
        <link rel="canonical" href="https://www.pricecharting.com/game/pal-wii-u/wii-u-console-deluxe-black-32gb" />
        <h1>Wii U Console Deluxe Black 32GB <a>PAL Wii U</a></h1>
        <div class="cover"><img src='https://example.com/wiiu.jpg'/></div>
      </body></html>`;

    const urls: string[] = [];
    mockedGet.mockImplementation(async (url: string) => {
      urls.push(String(url));
      if (String(url).includes("/search-products")) {
        return {
          status: 200,
          data: searchHtml,
          request: {
            res: {
              responseUrl: String(url),
            },
          },
        } as never;
      }
      return {
        status: 200,
        data: detailHtml,
        request: {
          res: {
            responseUrl:
              "https://www.pricecharting.com/game/pal-wii-u/wii-u-console-deluxe-black-32gb",
          },
        },
      } as never;
    });

    await expect(
      fetchMetadataFromPriceChartingByName(
        "Nintendo Wii U Black 32Go",
        "Wii U",
        true,
        false,
        { mediaType: "hardware" },
      ),
    ).resolves.toMatchObject({
      title: "Wii U Console Deluxe Black 32GB",
    });

    expect(urls[0]).toContain("/search-products");
    expect(urls[0]).toContain("type=prices");
    expect(urls.some((u) => /\/game\/[^/]+\/nintendo/.test(u))).toBe(false);
  });

  it("mines soft-404 search HTML instead of spraying more slug guesses", async () => {
    const searchHtml = `
      <html><body>Buy & Sell Search Results
        <tr class="offer" id="product-2">
          <td class="product_name"><a href="/game/wii/super-monkey-ball">Super Monkey Ball</a><h2><br>Wii</h2></td>
        </tr>
      </body></html>`;

    let inventedSlugCount = 0;
    let soft404Returned = false;
    mockedGet.mockImplementation(async (url: string) => {
      const href = String(url);
      if (href.includes("/search-products") && href.includes("type=prices")) {
        return {
          status: 200,
          data: `<html><body>Buy & Sell Search Results</body></html>`,
          request: { res: { responseUrl: href } },
        } as never;
      }
      // First /game/ guess soft-404s to search; later winner fiche is real.
      if (href.includes("/game/") && !soft404Returned) {
        soft404Returned = true;
        inventedSlugCount += 1;
        return {
          status: 200,
          data: searchHtml,
          request: {
            res: {
              responseUrl:
                "https://www.pricecharting.com/search-products?q=monkey",
            },
          },
        } as never;
      }
      return detailResponse();
    });

    await expect(
      fetchMetadataFromPriceChartingByName("Super Monkey Ball", "Wii", true),
    ).resolves.toMatchObject({ title: "Super Monkey Ball" });

    expect(inventedSlugCount).toBe(1);
  });

  it("stops further PriceCharting GETs after the first rate-limit in a name seek", async () => {
    resetPriceChartingQuotaBlockForTests();
    let calls = 0;
    mockedGet.mockImplementation(async () => {
      calls += 1;
      return { status: 429, data: "Too Many Requests" } as never;
    });

    await expect(
      fetchMetadataFromPriceChartingByName("Wii U Console", "Wii U", true),
    ).resolves.toBeNull();

    expect(calls).toBe(1);
    expect(isPriceChartingQuotaBlocked()).toBe(true);
    resetPriceChartingQuotaBlockForTests();
  });
});

describe("fetchPricesFromPriceCharting", () => {
  it("reuses durable ProviderEvidence for a pinned /game/ URL without HTTP", async () => {
    readPriceChartingPriceEvidence.mockResolvedValueOnce({
      priceUsed: 6820,
      priceUsedCIB: 21246,
      priceNew: 114110,
      sourceUrl:
        "https://www.pricecharting.com/game/pal-nintendo-64/nintendo-64-system",
      productName: "Nintendo 64 System",
    });

    await expect(
      fetchPricesFromPriceChartingGameUrl(
        "https://www.pricecharting.com/game/pal-nintendo-64/nintendo-64-system",
      ),
    ).resolves.toEqual({
      priceUsed: 6820,
      priceUsedCIB: 21246,
      priceNew: 114110,
      sourceUrl:
        "https://www.pricecharting.com/game/pal-nintendo-64/nintendo-64-system",
      productName: "Nintendo 64 System",
    });
    expect(mockedGet).not.toHaveBeenCalled();
    expect(promotePriceChartingPriceEvidence).not.toHaveBeenCalled();
  });

  it("evidenceOnly skips HTTP when DetailYield is missing", async () => {
    readPriceChartingPriceEvidence.mockResolvedValueOnce(null);

    await expect(
      fetchPricesFromPriceChartingGameUrl(
        "https://www.pricecharting.com/game/pal-playstation-3/sony-playstation-3-slim-silver-console",
        { evidenceOnly: true },
      ),
    ).resolves.toBeNull();
    expect(mockedGet).not.toHaveBeenCalled();
  });
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

describe("Game & Watch barcode / offers path with &", () => {
  it("keeps game-&-watch paths when resolving /offers?product= links", async () => {
    mockedGet.mockResolvedValue({
      status: 200,
      data: `
        <html><body>
          <a href="/game/game-&-watch/super-mario-bros">Super Mario Bros</a>
        </body></html>
      `,
      request: {
        res: {
          responseUrl: "https://www.pricecharting.com/offers?product=161681",
        },
      },
    } as never);

    await expect(
      resolvePriceChartingGamePathForTests("/offers?product=161681", {
        "User-Agent": "test",
      }),
    ).resolves.toBe("/game/game-&-watch/super-mario-bros");
  });

  it("resolves barcode 045496883041 via type=prices redirect to Game & Watch", async () => {
    mockedGet.mockImplementation(async (url: string) => {
      const href = String(url);
      if (
        href.includes("search-products") &&
        href.includes("045496883041") &&
        href.includes("type=prices")
      ) {
        return {
          status: 200,
          data: `
            <html>
              <head>
                <link rel="canonical" href="https://www.pricecharting.com/game/game-&-watch/super-mario-bros" />
              </head>
              <body>
                <h1>Super Mario Bros <a href="/console/game-&amp;-watch">Game &amp; Watch</a></h1>
                <div class="cover">
                  <img src='https://storage.googleapis.com/images.pricecharting.com/gw/240.jpg' />
                </div>
                <div id="extra-images">
                  <div class="extra">
                    <div>
                      <a href="https://storage.googleapis.com/images.pricecharting.com/gw/1600.jpg">
                        <img src="https://storage.googleapis.com/images.pricecharting.com/gw/240.jpg" />
                      </a>
                    </div>
                    <p>Main Image</p>
                  </div>
                </div>
                <div id="full-prices">
                  <td id="used_price"><span class="price">$50.00</span></td>
                </div>
              </body>
            </html>
          `,
          request: {
            res: {
              responseUrl:
                "https://www.pricecharting.com/game/game-&-watch/super-mario-bros?q=045496883041",
            },
          },
        } as never;
      }
      // Sibling soft-404 (no PAL Game & Watch for this SKU)
      if (href.includes("/game/pal-game-&-watch/")) {
        return {
          status: 200,
          data: `<html><body><h1>Prices</h1></body></html>`,
          request: {
            res: {
              responseUrl:
                "https://www.pricecharting.com/search-products?type=prices&q=super+mario+bros",
            },
          },
        } as never;
      }
      if (href.includes("search-products")) {
        return {
          status: 200,
          data: `<html><body><h1>Items matching your search</h1></body></html>`,
          request: { res: { responseUrl: href } },
        } as never;
      }
      throw new Error(`unexpected url ${url}`);
    });

    await expect(
      fetchMetadataFromPriceCharting(
        "045496883041",
        undefined,
        undefined,
        false,
        undefined,
        { mediaType: "hardware" },
      ),
    ).resolves.toMatchObject({
      title: "Super Mario Bros",
      platform: "Game & Watch",
      url: "https://www.pricecharting.com/game/game-&-watch/super-mario-bros",
      barcode: "045496883041",
    });

    expect(String(mockedGet.mock.calls[0]?.[0])).toContain("type=prices");
  });
});
