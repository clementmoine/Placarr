import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

const readFreakxySearchEvidence = vi.fn();
const promoteFreakxySearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  readFreakxySearchEvidence: (...args: unknown[]) =>
    readFreakxySearchEvidence(...args),
  promoteFreakxySearchEvidence: (...args: unknown[]) =>
    promoteFreakxySearchEvidence(...args),
}));

vi.mock("@/lib/http/flareSolverr", () => ({
  flareSolverrRequestGet: vi.fn().mockResolvedValue(null),
}));

import {
  fetchFromFreakxy,
  freakxySearchUrl,
  parseFreakxySearchHits,
} from "./fetch";

const mockedGet = vi.mocked(axios.get);

const SEARCH_HTML = `
<ul>
  <li class="item product product-item">
    <a class="product-item-link" href="/manette-dualsense.html">
      Manette DualSense Midnight Black
    </a>
    <img class="product-image-photo" src="https://www.freakxy.fr/media/dualsense.jpg" />
    <span class="price-wrapper" data-price-amount="69.90" data-price-type="finalPrice">
      <span class="price">69,90&nbsp;€</span>
    </span>
  </li>
</ul>
`;

describe("freakxy fetch", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    readFreakxySearchEvidence.mockReset();
    promoteFreakxySearchEvidence.mockReset();
    readFreakxySearchEvidence.mockResolvedValue(null);
    promoteFreakxySearchEvidence.mockResolvedValue(undefined);
  });

  it("construit l'URL catalogsearch barcode", () => {
    expect(freakxySearchUrl("711719541226")).toBe(
      "https://www.freakxy.fr/catalogsearch/result/?q=711719541226",
    );
  });

  it("parse Magento product-item hits with EUR price", () => {
    expect(parseFreakxySearchHits(SEARCH_HTML)).toEqual([
      {
        name: "Manette DualSense Midnight Black",
        coverUrl: "https://www.freakxy.fr/media/dualsense.jpg",
        priceCents: 6990,
        priceNew: 6990,
        sourceUrl: "https://www.freakxy.fr/manette-dualsense.html",
        productUrl: "https://www.freakxy.fr/manette-dualsense.html",
      },
    ]);
  });

  it("réutilise ProviderEvidence SearchYield sans HTTP", async () => {
    const hits = [
      {
        name: "Manette DualSense Midnight Black",
        coverUrl: "https://www.freakxy.fr/media/dualsense.jpg",
        priceCents: 6990,
        priceNew: 6990,
      },
    ];
    readFreakxySearchEvidence.mockResolvedValueOnce(hits);

    await expect(fetchFromFreakxy("711719541226")).resolves.toEqual(hits);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(promoteFreakxySearchEvidence).not.toHaveBeenCalled();
  });

  it("promotes SearchYield after a live search GET", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: SEARCH_HTML,
    } as never);

    const hits = await fetchFromFreakxy("711719541226");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.priceCents).toBe(6990);
    expect(promoteFreakxySearchEvidence).toHaveBeenCalledWith(
      "https://www.freakxy.fr/catalogsearch/result/?q=711719541226",
      [
        {
          name: "Manette DualSense Midnight Black",
          coverUrl: "https://www.freakxy.fr/media/dualsense.jpg",
          priceCents: 6990,
          priceNew: 6990,
          sourceUrl: "https://www.freakxy.fr/manette-dualsense.html",
          productUrl: "https://www.freakxy.fr/manette-dualsense.html",
        },
      ],
    );
  });
});
