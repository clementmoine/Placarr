import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  furetAttributeValue,
  furetSearchUrl,
  parseFuretProductPage,
  parseFuretSearchHits,
} from "./fetch";
import { mapFuretMetadata } from "./index";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("@/lib/http/flareSolverr", () => ({
  flareSolverrRequestGet: vi.fn().mockResolvedValue(null),
}));

const mockedGet = vi.mocked(axios.get);

const SAMPLE_EAN = "9782070360024";
const PRODUCT_URL = `https://www.furet.com/livres/l-etranger-albert-camus-${SAMPLE_EAN}.html`;

function productHtml() {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>L'étranger - Albert Camus | Furet du Nord</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Book",
    "image": "https://products-images.di-static.com/image/albert-camus-l-etranger/${SAMPLE_EAN}-475x500-1.jpg",
    "name": "L'étranger",
    "description": "Meursault reçoit un télégramme.",
    "offers": {
      "@type": "Offer",
      "priceCurrency": "EUR",
      "price": 7.6,
      "url": "/livres/l-etranger-albert-camus-${SAMPLE_EAN}.html"
    },
    "datePublished": "1971-01-01",
    "isbn": "978-2-07-036002-4",
    "publisher": { "@type": "Organization", "name": "Gallimard" },
    "author": { "@type": "Person", "name": "Albert Camus" },
    "numberOfPages": 184
  }
  </script>
</head>
<body>
  <ul>
    <li><span class="caption title">Nombre de pages</span><span class="body body-3">184</span></li>
    <li><span class="caption title">EAN</span><span class="body body-3">${SAMPLE_EAN}</span></li>
    <li><span class="caption title">ISBN</span><span class="body body-3">978-2-07-036002-4</span></li>
    <li><span class="caption title">Éditeur</span><span class="body body-3">Gallimard</span></li>
  </ul>
</body>
</html>`;
}

function searchHtml() {
  return `
<!DOCTYPE html>
<html>
<body>
  <a href="/livres/l-etranger-albert-camus-${SAMPLE_EAN}.html">L'étranger</a>
  <a href="/livres/l-etranger-albert-camus-${SAMPLE_EAN}_LO_2.html">L'étranger - autre édition</a>
</body>
</html>`;
}

describe("furet", () => {
  beforeEach(() => mockedGet.mockReset());

  it("construit l'URL de recherche", () => {
    expect(furetSearchUrl("Astérix")).toContain("/rechercher/result?q=");
    expect(furetSearchUrl("Astérix")).toContain("Ast%C3%A9rix");
  });

  it("parse les résultats de recherche", () => {
    const hits = parseFuretSearchHits(searchHtml());
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]).toMatchObject({
      barcode: SAMPLE_EAN,
      title: "L'étranger",
    });
  });

  it("lit les attributs fiche", () => {
    expect(furetAttributeValue(productHtml(), "EAN")).toBe(SAMPLE_EAN);
    expect(furetAttributeValue(productHtml(), "Éditeur")).toBe("Gallimard");
  });

  it("parse la fiche produit", () => {
    const product = parseFuretProductPage(productHtml(), PRODUCT_URL);
    expect(product).toMatchObject({
      title: "L'étranger",
      barcode: SAMPLE_EAN,
      publisher: "Gallimard",
      pageCount: 184,
      priceCents: 760,
    });
    expect(product?.authors).toContain("Albert Camus");
  });

  it("mappe metadata / prix", () => {
    const metadata = mapFuretMetadata(
      parseFuretProductPage(productHtml(), PRODUCT_URL),
    );
    expect(metadata?.barcode).toBe(SAMPLE_EAN);
    expect(metadata?.facts?.find((f) => f.kind === "price")?.value).toBe(
      "7,60 €",
    );
  });
});
