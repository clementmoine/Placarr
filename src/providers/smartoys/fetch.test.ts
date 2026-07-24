import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

const readSmartoysSearchEvidence = vi.fn();
const promoteSmartoysSearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  readSmartoysSearchEvidence: (...args: unknown[]) =>
    readSmartoysSearchEvidence(...args),
  promoteSmartoysSearchEvidence: (...args: unknown[]) =>
    promoteSmartoysSearchEvidence(...args),
}));

import axios from "axios";

import {
  fetchPricesFromSmartoys,
  parseSmartoysSearchHits,
  pickBestSmartoysSearchHit,
} from "./fetch";

const mockedGet = vi.mocked(axios.get);

const PRODUCT_HTML = `
<html>
  <head>
    <script type="application/ld+json">
      {
        "@type": "Product",
        "name": "The Last of Us Part I PS5",
        "image": "https://example.com/tlou.jpg",
        "offers": { "price": 29.99, "itemCondition": "NewCondition" }
      }
    </script>
  </head>
  <body>
    <td width="20%">24.00&nbsp;&euro;</td>
  </body>
</html>
`;

const WRONG_PRODUCT_HTML = `
<html>
  <head>
    <script type="application/ld+json">
      {
        "@type": "Product",
        "name": "Unrelated Accessory",
        "offers": { "price": 9.99, "itemCondition": "NewCondition" }
      }
    </script>
  </head>
</html>
`;

beforeEach(() => {
  mockedGet.mockReset();
  readSmartoysSearchEvidence.mockReset();
  promoteSmartoysSearchEvidence.mockReset();
  readSmartoysSearchEvidence.mockResolvedValue(null);
  promoteSmartoysSearchEvidence.mockResolvedValue(undefined);
});

describe("parseSmartoysSearchHits", () => {
  it("mines url + title from search anchors", () => {
    expect(
      parseSmartoysSearchHits(`
        <a href="https://www.smartoys.be/catalog/jeux-video-foo-p-111.html">Foo Game</a>
        <a href="https://www.smartoys.be/catalog/jeux-video-bar-p-222.html"><img alt="x"> Bar Game </a>
      `),
    ).toEqual([
      {
        url: "https://www.smartoys.be/catalog/jeux-video-foo-p-111.html",
        title: "Foo Game",
      },
      {
        url: "https://www.smartoys.be/catalog/jeux-video-bar-p-222.html",
        title: "Bar Game",
      },
    ]);
  });
});

describe("pickBestSmartoysSearchHit", () => {
  it("ranks locally so the wrong first row is not the winner", () => {
    const best = pickBestSmartoysSearchHit(
      [
        {
          url: "https://www.smartoys.be/catalog/jeux-video-accessory-p-1.html",
          title: "Controller Skin Pack",
        },
        {
          url: "https://www.smartoys.be/catalog/jeux-video-tlou-p-2.html",
          title: "The Last of Us Part I PS5",
        },
        {
          url: "https://www.smartoys.be/catalog/jeux-video-other-p-3.html",
          title: "Uncharted Collection",
        },
      ],
      ["The Last of Us Part I"],
    );
    expect(best?.url).toContain("-p-2.html");
  });
});

describe("fetchPricesFromSmartoys", () => {
  it("recherche par titre dans le catalogue jeux-video", async () => {
    mockedGet
      .mockResolvedValueOnce({
        status: 200,
        data: `
          <a href="https://www.smartoys.be/catalog/jeux-video-playstation-the-last-part-p-0711719405191.html">TLOU</a>
        `,
        request: { res: { responseUrl: "https://www.smartoys.be/search" } },
      } as never)
      .mockResolvedValueOnce({
        status: 200,
        data: PRODUCT_HTML,
        request: {
          res: {
            responseUrl:
              "https://www.smartoys.be/catalog/jeux-video-playstation-the-last-part-p-0711719405191.html",
          },
        },
      } as never);

    await expect(
      fetchPricesFromSmartoys("The Last of Us Part I", [
        "The Last of Us Part I",
      ]),
    ).resolves.toMatchObject({
      priceNew: 2999,
      priceUsed: 2400,
      productName: "The Last of Us Part I PS5",
    });
  });

  it("mines search then fetches only the ranked winner (not N fiches)", async () => {
    mockedGet
      .mockResolvedValueOnce({
        status: 200,
        data: `
          <a href="https://www.smartoys.be/catalog/jeux-video-skin-p-111.html">Controller Skin Pack</a>
          <a href="https://www.smartoys.be/catalog/jeux-video-uncharted-p-222.html">Uncharted Collection</a>
          <a href="https://www.smartoys.be/catalog/jeux-video-tlou-p-0711719405191.html">The Last of Us Part I PS5</a>
        `,
      } as never)
      .mockResolvedValueOnce({
        status: 200,
        data: PRODUCT_HTML,
      } as never)
      .mockResolvedValueOnce({
        status: 200,
        data: WRONG_PRODUCT_HTML,
      } as never);

    await expect(
      fetchPricesFromSmartoys("The Last of Us Part I", [
        "The Last of Us Part I",
      ]),
    ).resolves.toMatchObject({
      priceNew: 2999,
      productName: "The Last of Us Part I PS5",
    });

    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(String(mockedGet.mock.calls[1]?.[0])).toContain("-p-0711719405191.html");
  });

  it("réutilise ProviderEvidence SearchYield sans HTTP search", async () => {
    readSmartoysSearchEvidence.mockResolvedValueOnce([
      {
        url: "https://www.smartoys.be/catalog/jeux-video-tlou-p-0711719405191.html",
        title: "The Last of Us Part I PS5",
      },
    ]);
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: PRODUCT_HTML,
    } as never);

    await expect(
      fetchPricesFromSmartoys("The Last of Us Part I", [
        "The Last of Us Part I",
      ]),
    ).resolves.toMatchObject({
      priceNew: 2999,
      productName: "The Last of Us Part I PS5",
    });

    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(String(mockedGet.mock.calls[0]?.[0])).toContain("-p-0711719405191.html");
    expect(promoteSmartoysSearchEvidence).not.toHaveBeenCalled();
  });

  it("promotes SearchYield after a live search GET", async () => {
    mockedGet
      .mockResolvedValueOnce({
        status: 200,
        data: `
          <a href="https://www.smartoys.be/catalog/jeux-video-tlou-p-0711719405191.html">The Last of Us Part I PS5</a>
        `,
      } as never)
      .mockResolvedValueOnce({
        status: 200,
        data: PRODUCT_HTML,
      } as never);

    await fetchPricesFromSmartoys("The Last of Us Part I", [
      "The Last of Us Part I",
    ]);

    expect(promoteSmartoysSearchEvidence).toHaveBeenCalledWith(
      "https://www.smartoys.be/catalog/advanced_search_result.php?keywords=The%20Last%20of%20Us%20Part%20I",
      [
        {
          url: "https://www.smartoys.be/catalog/jeux-video-tlou-p-0711719405191.html",
          title: "The Last of Us Part I PS5",
        },
      ],
    );
  });
});
