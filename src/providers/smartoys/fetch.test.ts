import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
import axios from "axios";

import { fetchPricesFromSmartoys } from "./fetch";

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

beforeEach(() => {
  mockedGet.mockReset();
});

describe("fetchPricesFromSmartoys", () => {
  it("recherche par titre dans le catalogue jeux-video", async () => {
    mockedGet
      .mockResolvedValueOnce({
        data: `
          <a href="https://www.smartoys.be/catalog/jeux-video-playstation-the-last-part-p-0711719405191.html">TLOU</a>
        `,
        request: { res: { responseUrl: "https://www.smartoys.be/search" } },
      } as never)
      .mockResolvedValueOnce({
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
});
