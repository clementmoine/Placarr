import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

const readDecitreSearchEvidence = vi.fn();
const promoteDecitreSearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  readDecitreSearchEvidence: (...args: unknown[]) =>
    readDecitreSearchEvidence(...args),
  promoteDecitreSearchEvidence: (...args: unknown[]) =>
    promoteDecitreSearchEvidence(...args),
}));

vi.mock("@/lib/http/flareSolverr", () => ({
  flareSolverrRequestGet: vi.fn().mockResolvedValue(null),
}));

import {
  decitreAttributeValue,
  decitreSearchUrl,
  fetchDecitreByBarcode,
  fetchDecitreProduct,
  parseDecitreProductPage,
  parseDecitreSearchHits,
  resolveDecitreMetadata,
  searchDecitreHits,
} from "./fetch";
import { mapDecitreMetadata } from "./index";

const mockedGet = vi.mocked(axios.get);

const SAMPLE_EAN = "9782017321675";
const PRODUCT_URL = `https://www.decitre.fr/livres/ecris-notre-histoire-${SAMPLE_EAN}.html`;

function productHtml(overrides: { ean?: string; title?: string } = {}) {
  const ean = overrides.ean ?? SAMPLE_EAN;
  const title = overrides.title ?? "Ecris notre histoire";
  return `
<!DOCTYPE html>
<html>
<head>
  <title>${title} - Tillie Cole | Decitre</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Book",
    "image": "https://products-images.di-static.com/image/cole-tillie-ecris-notre-histoire/${ean}-475x500-1.webp",
    "name": "${title}",
    "bookFormat": "Grand Format",
    "description": "Depuis toujours, June Scott rêve de devenir romancière.",
    "offers": {
      "@type": "Offer",
      "priceCurrency": "EUR",
      "price": 19,
      "url": "/livres/ecris-notre-histoire-${ean}.html",
      "availability": "https://schema.org/InStock"
    },
    "datePublished": "2025-08-20",
    "isbn": "978-2-01-732167-5",
    "publisher": { "@type": "Organization", "name": "Hachette Romans" },
    "author": { "@type": "Person", "name": "Tillie Cole" }
  }
  </script>
</head>
<body>
  <ul>
    <li><span class="caption title">Nombre de pages</span><span class="body body-3">334</span></li>
    <li><span class="caption title">Format</span><span class="body body-3">Grand Format</span></li>
    <li><span class="caption title">EAN</span><span class="body body-3">${ean}</span></li>
    <li><span class="caption title">ISBN</span><span class="body body-3">978-2-01-732167-5</span></li>
    <li><span class="caption title">Éditeur</span><span class="body body-3">Hachette Romans</span></li>
    <li><span class="caption title">Traducteur</span><span class="body body-3">Charlotte Faraday</span></li>
  </ul>
</body>
</html>`;
}

function searchHtml(ean = SAMPLE_EAN) {
  return `
<!DOCTYPE html>
<html>
<body>
  <a href="/livres/litterature.html">Livres</a>
  <a href="/livres/ecris-notre-histoire-${ean}.html">Ecris notre histoire</a>
  <a href="/livres/ecris-notre-histoire-${ean}.html">Grand Format 19,00 €</a>
</body>
</html>`;
}

describe("decitre fetch", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    readDecitreSearchEvidence.mockReset();
    promoteDecitreSearchEvidence.mockReset();
    readDecitreSearchEvidence.mockResolvedValue(null);
    promoteDecitreSearchEvidence.mockResolvedValue(undefined);
  });

  it("construit l'URL de recherche ISBN", () => {
    expect(decitreSearchUrl(SAMPLE_EAN)).toBe(
      `https://www.decitre.fr/search?search=${SAMPLE_EAN}`,
    );
  });

  it("extrait les attributs fiche (pages, EAN)", () => {
    const html = productHtml();
    expect(decitreAttributeValue(html, "Nombre de pages")).toBe("334");
    expect(decitreAttributeValue(html, "EAN")).toBe(SAMPLE_EAN);
  });

  it("parse la fiche produit JSON-LD + attributs", () => {
    const product = parseDecitreProductPage(productHtml(), PRODUCT_URL);
    expect(product).toMatchObject({
      title: "Ecris notre histoire",
      barcode: SAMPLE_EAN,
      publisher: "Hachette Romans",
      pageCount: 334,
      bookFormat: "Grand Format",
      releaseDate: "2025-08-20",
      priceCents: 1900,
      authors: ["Tillie Cole"],
      translators: ["Charlotte Faraday"],
      coverUrl: `https://products-images.di-static.com/image/cole-tillie-ecris-notre-histoire/${SAMPLE_EAN}-475x500-1.webp`,
      productUrl: PRODUCT_URL,
    });
    expect(product?.description).toContain("June Scott");
  });

  it("rejette une fiche sans titre", () => {
    expect(parseDecitreProductPage("<html></html>", PRODUCT_URL)).toBeNull();
  });

  it("parse les hits de recherche et déduplique", () => {
    expect(parseDecitreSearchHits(searchHtml())).toEqual([
      {
        title: "Ecris notre histoire",
        productUrl: PRODUCT_URL,
        barcode: SAMPLE_EAN,
      },
    ]);
  });

  it("résout un produit par EAN (search → fiche)", async () => {
    mockedGet
      .mockResolvedValueOnce({ status: 200, data: searchHtml() })
      .mockResolvedValueOnce({ status: 200, data: productHtml() });

    const product = await fetchDecitreByBarcode(SAMPLE_EAN);
    expect(product?.title).toBe("Ecris notre histoire");
    expect(product?.barcode).toBe(SAMPLE_EAN);
    expect(product?.priceCents).toBe(1900);
  });

  it("rejette un EAN qui ne matche pas la fiche", async () => {
    mockedGet
      .mockResolvedValueOnce({ status: 200, data: searchHtml() })
      .mockResolvedValueOnce({
        status: 200,
        data: productHtml({ ean: "9780000000002" }),
      });

    expect(await fetchDecitreByBarcode(SAMPLE_EAN)).toBeNull();
  });

  it("retourne null sur barcode invalide", async () => {
    expect(await fetchDecitreByBarcode("abc")).toBeNull();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("fetchDecitreProduct parse une URL absolue", async () => {
    mockedGet.mockResolvedValue({ status: 200, data: productHtml() });
    const product = await fetchDecitreProduct(PRODUCT_URL);
    expect(product?.title).toBe("Ecris notre histoire");
  });

  it("resolve par titre aligne le hit catalogue", async () => {
    mockedGet
      .mockResolvedValueOnce({ status: 200, data: searchHtml() })
      .mockResolvedValueOnce({ status: 200, data: productHtml() });

    const product = await resolveDecitreMetadata({
      name: "Ecris notre histoire",
    });
    expect(product?.barcode).toBe(SAMPLE_EAN);
  });

  it("mappe MetadataResult + external-link + observations", () => {
    const product = parseDecitreProductPage(productHtml(), PRODUCT_URL);
    const metadata = mapDecitreMetadata(product);
    expect(metadata?.title).toBe("Ecris notre histoire");
    expect(metadata?.pageCount).toBe(334);
    expect(metadata?.facts?.some((f) => f.kind === "external-link")).toBe(true);
    expect(metadata?.observations?.length).toBeGreaterThan(0);
    expect(metadata?.externalIds?.decitre).toBe(SAMPLE_EAN);
  });

  it("réutilise ProviderEvidence SearchYield sans HTTP", async () => {
    const hits = [
      {
        title: "Ecris notre histoire",
        productUrl: PRODUCT_URL,
        barcode: SAMPLE_EAN,
      },
    ];
    readDecitreSearchEvidence.mockResolvedValueOnce(hits);

    await expect(searchDecitreHits(SAMPLE_EAN)).resolves.toEqual(hits);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(promoteDecitreSearchEvidence).not.toHaveBeenCalled();
  });

  it("promotes SearchYield after a live search GET", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: searchHtml(),
      responseUrl: decitreSearchUrl(SAMPLE_EAN),
    } as never);

    const hits = await searchDecitreHits(SAMPLE_EAN);
    expect(hits).toEqual([
      {
        title: "Ecris notre histoire",
        productUrl: PRODUCT_URL,
        barcode: SAMPLE_EAN,
      },
    ]);
    expect(promoteDecitreSearchEvidence).toHaveBeenCalledWith(
      `https://www.decitre.fr/search?search=${SAMPLE_EAN}`,
      hits,
    );
  });
});
