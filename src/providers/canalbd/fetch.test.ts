import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const readCanalbdSearchEvidence = vi.fn();
const promoteCanalbdSearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  readCanalbdSearchEvidence: (...args: unknown[]) =>
    readCanalbdSearchEvidence(...args),
  promoteCanalbdSearchEvidence: (...args: unknown[]) =>
    promoteCanalbdSearchEvidence(...args),
}));

vi.mock("@/lib/http/flareSolverr", () => ({
  flareSolverrRequestGet: vi.fn().mockResolvedValue(null),
}));

import axios from "axios";

import {
  canalbdSearchUrl,
  parseCanalbdArticlePage,
  parseCanalbdOffersPrice,
  parseCanalbdSearchHits,
  searchCanalbdHits,
} from "./fetch";
import { mapCanalbdMetadata } from "./index";

const mockedGet = vi.mocked(axios.get);

function searchHtml() {
  return `
<article class="card-booksm">
  <a href="/articles/asterix-t9-asterix-chez-les-normands-edition-enrichie-1269046/"
     class="card-booksm-cover">
    <img src="https://canalbd.b-cdn.net/abc/cover.webp" alt="Image de Astérix T9">
  </a>
  <div class="card-booksm-info">
    <a href="/articles/asterix-t9-asterix-chez-les-normands-edition-enrichie-1269046/"
       class="card-booksm-info-details">
      <span class="title hover-color">Astérix T9 - Astérix chez les Normands (Édition Enrichie)</span>
    </a>
  </div>
</article>`;
}

function articleHtml() {
  return `<!DOCTYPE html><html><head>
  <meta property="og:type" content="product"/>
  <meta property="og:title" content="Astérix T9 - Astérix chez les Normands (Édition Enrichie)"/>
  <meta property="og:description" content="Redécouvrez le 9e tome."/>
  <meta property="og:image" content="https://canalbd.b-cdn.net/abc/cover.webp"/>
  <meta itemprop="isbn" content="9782017322382"/>
  <meta itemprop="datePublished" content="2026-06-10"/>
  <meta itemprop="numberOfPages" content="64"/>
  <meta itemprop="ratingValue" content="5"/>
  <meta itemprop="reviewCount" content="1"/>
</head><body>
  <h1>Astérix T9 - Astérix chez les Normands (Édition Enrichie)</h1>
  <a href="/personnes/albert-uderzo-364/">Albert Uderzo</a>
  <a href="/personnes/rene-goscinny-2893/">René Goscinny</a>
  <a href="/series/asterix-567/">Astérix</a>
  <ul>
    <li>Éditeur : HACHETTE</li>
    <li>EAN13 : 9782017322382</li>
    <li>Nombre de pages: 64</li>
  </ul>
</body></html>`;
}

function offersHtml() {
  return `
<div class="product-offer-price">
  Neuf :
  <span class="product-offer-price-value">10,99 €</span>
</div>`;
}

describe("canalbd", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    readCanalbdSearchEvidence.mockReset();
    promoteCanalbdSearchEvidence.mockReset();
    readCanalbdSearchEvidence.mockResolvedValue(null);
    promoteCanalbdSearchEvidence.mockResolvedValue(undefined);
  });

  it("construit l'URL de recherche", () => {
    expect(canalbdSearchUrl("Astérix")).toContain("q=Ast%C3%A9rix");
  });

  it("parse les résultats de recherche", () => {
    const hits = parseCanalbdSearchHits(searchHtml());
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      id: "1269046",
      title: "Astérix T9 - Astérix chez les Normands (Édition Enrichie)",
    });
  });

  it("parse la fiche article", () => {
    const article = parseCanalbdArticlePage(
      articleHtml(),
      "https://www.canalbd.net/articles/asterix-t9-asterix-chez-les-normands-edition-enrichie-1269046/",
    );
    expect(article).toMatchObject({
      id: "1269046",
      title: "Astérix T9 - Astérix chez les Normands (Édition Enrichie)",
      publisher: "HACHETTE",
      seriesName: "Astérix",
      barcode: "9782017322382",
      pageCount: 64,
      ratingValue: 5,
    });
    expect(article?.authors).toEqual(
      expect.arrayContaining(["Albert Uderzo", "René Goscinny"]),
    );
  });

  it("parse le prix HTMX", () => {
    expect(parseCanalbdOffersPrice(offersHtml())).toBe(1099);
  });

  it("mappe facts / barcode / série", () => {
    const metadata = mapCanalbdMetadata(
      parseCanalbdArticlePage(
        articleHtml(),
        "https://www.canalbd.net/articles/asterix-t9-asterix-chez-les-normands-edition-enrichie-1269046/",
      ),
    );
    expect(metadata?.externalIds).toEqual({ canalbd: "1269046" });
    expect(metadata?.barcode).toBe("9782017322382");
    expect(metadata?.facts?.find((f) => f.kind === "series")?.value).toBe(
      "Astérix",
    );
  });

  it("réutilise ProviderEvidence SearchYield sans HTTP", async () => {
    const hits = [
      {
        id: "1269046",
        title: "Astérix T9",
        url: "https://www.canalbd.net/articles/asterix-t9-1269046/",
      },
    ];
    readCanalbdSearchEvidence.mockResolvedValueOnce(hits);

    await expect(searchCanalbdHits("Astérix")).resolves.toEqual(hits);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(promoteCanalbdSearchEvidence).not.toHaveBeenCalled();
  });

  it("promotes SearchYield after a live search GET", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: searchHtml(),
    } as never);

    const hits = await searchCanalbdHits("Astérix");
    expect(hits).toHaveLength(1);
    expect(promoteCanalbdSearchEvidence).toHaveBeenCalledWith(
      expect.stringContaining("/recherche/?q="),
      expect.arrayContaining([
        expect.objectContaining({ id: "1269046" }),
      ]),
    );
  });
});
