import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

const readPlayInSearchEvidence = vi.fn();
const promotePlayInSearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  readPlayInSearchEvidence: (...args: unknown[]) =>
    readPlayInSearchEvidence(...args),
  promotePlayInSearchEvidence: (...args: unknown[]) =>
    promotePlayInSearchEvidence(...args),
}));

import axios from "axios";

import {
  parsePlayInCatalogueHits,
  parsePlayInProductHtml,
  parsePlayInProductJsonLd,
  searchPlayInHits,
} from "./fetch";

const mockedGet = vi.mocked(axios.get);

const PRODUCT_URL =
  "https://www.play-in.com/fr/produit/202062/black-stories-morts-de-rire";

const JSON_LD_SCRIPT = `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Black Stories - Morts de Rire",
  "image": ["https://media.play-in.com/img/product/black-stories-morts-de-rire-iello.png"],
  "description": "Retrouvez 50 histoires étranges et drôles.",
  "sku": "202062",
  "gtin14": "626570614616",
  "offers": {
    "@type": "Offer",
    "priceCurrency": "EUR",
    "price": 13.5
  }
}
</script>`;

const RSC_HTML = `
<script>self.__next_f.push([1,"120:T54e,{\\"@context\\":\\"https://schema.org\\",\\"@type\\":\\"Product\\",\\"name\\":\\"Black Stories - Morts de Rire\\",\\"image\\":[\\"https://media.play-in.com/img/product/black-stories-morts-de-rire-iello.png\\"],\\"description\\":\\"Retrouvez 50 histoires.\\",\\"sku\\":\\"202062\\",\\"gtin14\\":\\"626570614616\\",\\"offers\\":{\\"@type\\":\\"Offer\\",\\"priceCurrency\\":\\"EUR\\",\\"price\\":13.5}}"])</script>`;

const CATALOGUE_HTML = `
<a href="/fr/produit/202062/black-stories-morts-de-rire">Black Stories</a>
<a href="/fr/produit/999999/other-game">Other</a>`;

beforeEach(() => {
  mockedGet.mockReset();
  readPlayInSearchEvidence.mockReset();
  promotePlayInSearchEvidence.mockReset();
  readPlayInSearchEvidence.mockResolvedValue(null);
  promotePlayInSearchEvidence.mockResolvedValue(undefined);
});

describe("parsePlayInProductJsonLd", () => {
  it("reads a standard Product JSON-LD block", () => {
    const data = parsePlayInProductJsonLd(JSON_LD_SCRIPT);
    expect(data.name).toBe("Black Stories - Morts de Rire");
    expect(data.gtin).toBe("626570614616");
    expect(data.sku).toBe("202062");
    expect(data.priceCents).toBe(1350);
    expect(data.images).toEqual([
      "https://media.play-in.com/img/product/black-stories-morts-de-rire-iello.png",
    ]);
  });

  it("falls back to escaped Next.js RSC payloads", () => {
    const data = parsePlayInProductJsonLd(RSC_HTML);
    expect(data.name).toBe("Black Stories - Morts de Rire");
    expect(data.gtin).toBe("626570614616");
    expect(data.priceCents).toBe(1350);
  });
});

describe("parsePlayInCatalogueHits", () => {
  it("extracts board-game catalogue product links", () => {
    expect(parsePlayInCatalogueHits(CATALOGUE_HTML)).toEqual([
      {
        url: PRODUCT_URL,
        productId: "202062",
      },
      {
        url: "https://www.play-in.com/fr/produit/999999/other-game",
        productId: "999999",
      },
    ]);
  });

  it("reads product URLs from Next.js RSC search payloads", () => {
    const html = `
      <a href="/fr/produit/201540/a-la-gloire-d-odin">Featured</a>
      self.__next_f.push([1,"{\\"name\\":\\"Black Stories - Morts de Rire\\",\\"url\\":\\"/fr/produit/202062/black-stories-morts-de-rire\\"}"]);
      {"name":"Black Stories","url":"/fr/produit/202056/black-stories"}
    `;
    expect(parsePlayInCatalogueHits(html)).toEqual([
      {
        url: "https://www.play-in.com/fr/produit/202062/black-stories-morts-de-rire",
        productId: "202062",
      },
      {
        url: "https://www.play-in.com/fr/produit/202056/black-stories",
        productId: "202056",
      },
    ]);
  });
});

describe("parsePlayInProductHtml", () => {
  it("maps JSON-LD into a product record", () => {
    const product = parsePlayInProductHtml(JSON_LD_SCRIPT, PRODUCT_URL);
    expect(product.title).toBe("Black Stories - Morts de Rire");
    expect(product.barcode).toBe("626570614616");
    expect(product.reference).toBe("202062");
    expect(product.priceCents).toBe(1350);
    expect(product.productUrl).toBe(PRODUCT_URL);
  });
});

describe("searchPlayInHits", () => {
  it("réutilise ProviderEvidence SearchYield sans HTTP", async () => {
    readPlayInSearchEvidence.mockResolvedValueOnce([
      { url: PRODUCT_URL, productId: "202062" },
    ]);

    await expect(searchPlayInHits("Black Stories")).resolves.toEqual([
      { url: PRODUCT_URL, productId: "202062" },
    ]);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(promotePlayInSearchEvidence).not.toHaveBeenCalled();
  });

  it("promotes SearchYield after a live search GET", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: CATALOGUE_HTML,
    } as never);

    await expect(searchPlayInHits("Black Stories")).resolves.toEqual([
      { url: PRODUCT_URL, productId: "202062" },
      {
        url: "https://www.play-in.com/fr/produit/999999/other-game",
        productId: "999999",
      },
    ]);
    expect(promotePlayInSearchEvidence).toHaveBeenCalledWith(
      "https://www.play-in.com/fr/gamme/5/jeux-de-societe/catalogue?search=Black%20Stories",
      [
        { url: PRODUCT_URL, productId: "202062" },
        {
          url: "https://www.play-in.com/fr/produit/999999/other-game",
          productId: "999999",
        },
      ],
    );
  });
});
