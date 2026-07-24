import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

const readBdFugueSearchEvidence = vi.fn();
const promoteBdFugueSearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  readBdFugueSearchEvidence: (...args: unknown[]) =>
    readBdFugueSearchEvidence(...args),
  promoteBdFugueSearchEvidence: (...args: unknown[]) =>
    promoteBdFugueSearchEvidence(...args),
}));

vi.mock("@/lib/http/flareSolverr", () => ({
  flareSolverrRequestGet: vi.fn().mockResolvedValue(null),
}));

import {
  bdfugueAttributeValue,
  bdfugueSearchUrl,
  fetchBdFugueByBarcode,
  parseBdFugueCredits,
  parseBdFugueFrenchDate,
  parseBdFugueProductPage,
  parseBdFugueSearchHits,
  resolveBdFugueMetadata,
  searchBdFugueHits,
} from "./fetch";
import { mapBdFugueMetadata } from "./index";

const mockedGet = vi.mocked(axios.get);

const SAMPLE_EAN = "9782377170319";
const PRODUCT_URL = "https://www.bdfugue.com/danmachi-tome-1";

function productHtml(overrides: { ean?: string; title?: string } = {}) {
  const ean = overrides.ean ?? SAMPLE_EAN;
  const title = overrides.title ?? "DanMachi - la Légende des Familias tome 1";
  return `
<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <script type="application/ld+json">
  {
    "@context": "http://schema.org",
    "@type": "Product",
    "name": "${title}",
    "description": "DanMachi SEO boilerplate 1ère Librairie envois rapides",
    "image": "https://www.bdfugue.com/media/catalog/product/cache/abc/9/7/${ean}_1_75.jpg",
    "offers": {
      "@type": "https://schema.org/Offer",
      "url": "${PRODUCT_URL}",
      "priceCurrency": "EUR",
      "price": 7.35,
      "availability": "https://schema.org/InStock"
    },
    "aggregateRating": {
      "ratingValue": "67",
      "reviewCount": "3",
      "bestRating": 100,
      "worstRating": 0,
      "@type": "AggregateRating"
    },
    "productID": "${ean}",
    "gtin13": "${ean}",
    "sku": "${ean}"
  }
  </script>
</head>
<body>
  <h1>${title}</h1>
  <div class="description">
    Bienvenue à Orario, la Cité-Labyrinthe où cohabitent dieux et humains.
    Sous cette ville, les aventuriers partent en quête de gloire.
  </div>
  <div class="label">Référence :</div>
  <div class="col data w-2/3 product-attribute-value font-semibold">${ean}</div>
  <div class="label">Genre(s) :</div>
  <div class="col data w-2/3 product-attribute-value font-semibold">Shonen</div>
  <div class="label">Éditeur :</div>
  <div class="col data w-2/3 product-attribute-value font-semibold">Ototo</div>
  <div class="label">Auteur(s) :</div>
  <div class="col data w-2/3 product-attribute-value font-semibold">Fujino Omori (Scénario) / Kunieda (Dessin)</div>
  <div class="label">Reliure :</div>
  <div class="col data w-2/3 product-attribute-value font-semibold">Couverture souple</div>
  <div class="label">Série :</div>
  <div class="col data w-2/3 product-attribute-value font-semibold">DanMachi</div>
  <div class="label">Tome :</div>
  <div class="col data w-2/3 product-attribute-value font-semibold">1</div>
  <div class="label">date de parution :</div>
  <div class="col data w-2/3 product-attribute-value font-semibold">8 sept. 2017</div>
</body>
</html>`;
}

function searchHtml() {
  return `
<!DOCTYPE html>
<html>
<body>
  <div class="products wrapper mode-grid">
    <picture>
      <img src="https://www.bdfugue.com/media/catalog/product/cache/x/9/7/9782723442381_1_75.jpg" alt="alice 19th tome 1">
    </picture>
    <h3>
      <a href="https://www.bdfugue.com/alice-19th-t-1">alice 19th tome 1</a>
    </h3>
  </div>
</body>
</html>`;
}

describe("bdfugue fetch", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    readBdFugueSearchEvidence.mockReset();
    promoteBdFugueSearchEvidence.mockReset();
    readBdFugueSearchEvidence.mockResolvedValue(null);
    promoteBdFugueSearchEvidence.mockResolvedValue(undefined);
  });

  it("construit l'URL de recherche Magento", () => {
    expect(bdfugueSearchUrl(SAMPLE_EAN)).toBe(
      `https://www.bdfugue.com/catalogsearch/result/?q=${SAMPLE_EAN}`,
    );
  });

  it("parse crédits avec rôles", () => {
    expect(
      parseBdFugueCredits("Fujino Omori (Scénario) / Kunieda (Dessin)"),
    ).toEqual([
      { name: "Fujino Omori", role: "Scénario" },
      { name: "Kunieda", role: "Dessin" },
    ]);
  });

  it("parse une date FR abrégée", () => {
    expect(parseBdFugueFrenchDate("8 sept. 2017")).toBe("2017-09-08");
  });

  it("extrait les attributs fiche", () => {
    const html = productHtml();
    expect(bdfugueAttributeValue(html, "Référence")).toBe(SAMPLE_EAN);
    expect(bdfugueAttributeValue(html, "Série")).toBe("DanMachi");
    expect(bdfugueAttributeValue(html, "Tome")).toBe("1");
  });

  it("parse la fiche produit JSON-LD + attributs", () => {
    const product = parseBdFugueProductPage(productHtml(), PRODUCT_URL);
    expect(product).toMatchObject({
      title: "DanMachi - la Légende des Familias tome 1",
      barcode: SAMPLE_EAN,
      publisher: "Ototo",
      seriesName: "DanMachi",
      issueNumber: "1",
      genre: "Shonen",
      binding: "Couverture souple",
      releaseDate: "2017-09-08",
      priceCents: 735,
      ratingValue: 3.35,
      ratingCount: 3,
      productUrl: PRODUCT_URL,
    });
    expect(product?.authors).toEqual([
      { name: "Fujino Omori", role: "Scénario" },
      { name: "Kunieda", role: "Dessin" },
    ]);
    expect(product?.description).toContain("Orario");
    expect(product?.coverUrl).toContain(SAMPLE_EAN);
  });

  it("parse les hits de recherche (cover ISBN + lien)", () => {
    expect(parseBdFugueSearchHits(searchHtml())).toEqual([
      {
        title: "alice 19th tome 1",
        productUrl: "https://www.bdfugue.com/alice-19th-t-1",
        barcode: "9782723442381",
        coverUrl:
          "https://www.bdfugue.com/media/catalog/product/cache/x/9/7/9782723442381_1_75.jpg",
      },
    ]);
  });

  it("résout un EAN via redirect search → fiche", async () => {
    mockedGet.mockResolvedValue({
      status: 200,
      data: productHtml(),
      request: { res: { responseUrl: PRODUCT_URL } },
    });

    const product = await fetchBdFugueByBarcode(SAMPLE_EAN);
    expect(product?.title).toContain("DanMachi");
    expect(product?.barcode).toBe(SAMPLE_EAN);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("rejette une fiche dont l'EAN contredit la demande", async () => {
    mockedGet.mockResolvedValue({
      status: 200,
      data: productHtml({ ean: "9780000000002" }),
      request: { res: { responseUrl: PRODUCT_URL } },
    });

    expect(await fetchBdFugueByBarcode(SAMPLE_EAN)).toBeNull();
  });

  it("resolve par titre aligne un hit catalogue", async () => {
    mockedGet
      .mockResolvedValueOnce({ status: 200, data: searchHtml() })
      .mockResolvedValueOnce({
        status: 200,
        data: productHtml({
          ean: "9782723442381",
          title: "Alice 19th tome 1",
        }),
        request: {
          res: { responseUrl: "https://www.bdfugue.com/alice-19th-t-1" },
        },
      });

    const product = await resolveBdFugueMetadata({
      name: "Alice 19th tome 1",
    });
    expect(product?.barcode).toBe("9782723442381");
  });

  it("mappe MetadataResult + série + observations", () => {
    const metadata = mapBdFugueMetadata(
      parseBdFugueProductPage(productHtml(), PRODUCT_URL),
    );
    expect(metadata?.title).toContain("DanMachi");
    expect(metadata?.facts?.some((f) => f.kind === "series")).toBe(true);
    expect(
      metadata?.facts?.some((f) => f.kind === "tag" && f.label === "Tome"),
    ).toBe(true);
    expect(metadata?.facts?.some((f) => f.kind === "external-link")).toBe(
      true,
    );
    expect(metadata?.observations?.length).toBeGreaterThan(0);
    expect(metadata?.externalIds?.bdfugue).toBe(SAMPLE_EAN);
  });

  it("réutilise ProviderEvidence SearchYield sans HTTP", async () => {
    const hits = [
      {
        title: "alice 19th tome 1",
        productUrl: "https://www.bdfugue.com/alice-19th-t-1",
        barcode: "9782723442381",
      },
    ];
    readBdFugueSearchEvidence.mockResolvedValueOnce(hits);

    await expect(searchBdFugueHits("alice")).resolves.toEqual(hits);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(promoteBdFugueSearchEvidence).not.toHaveBeenCalled();
  });

  it("promotes SearchYield after a live search GET", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: searchHtml(),
    } as never);

    const hits = await searchBdFugueHits("alice");
    expect(hits[0]?.productUrl).toContain("alice-19th");
    expect(promoteBdFugueSearchEvidence).toHaveBeenCalledWith(
      expect.stringContaining("/catalogsearch/result/?q=alice"),
      expect.arrayContaining([
        expect.objectContaining({ barcode: "9782723442381" }),
      ]),
    );
  });
});
