import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

const readVivlioSearchEvidence = vi.fn();
const promoteVivlioSearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  readVivlioSearchEvidence: (...args: unknown[]) =>
    readVivlioSearchEvidence(...args),
  promoteVivlioSearchEvidence: (...args: unknown[]) =>
    promoteVivlioSearchEvidence(...args),
}));

vi.mock("@/lib/http/flareSolverr", () => ({
  flareSolverrRequestGet: vi.fn().mockResolvedValue(null),
}));

import {
  normalizeVivlioCoverUrl,
  parseVivlioProductPage,
  parseVivlioSearchHits,
  searchVivlioHits,
  vivlioCoverDownloadCandidates,
  vivlioSearchUrl,
} from "./fetch";
import { mapVivlioMetadata, vivlioModule } from "./index";

const mockedGet = vi.mocked(axios.get);

const PRODUCT_URL =
  "https://shop.vivlio.com/product/9782755620610_9782755620610_9/after-tome-01";

function productHtml() {
  return `<!DOCTYPE html><html><head>
  <title>After - Tome 01 Ebook</title>
  <meta property="og:image" content="https://cdn.vivlio.com/product/v1/128ddaf0/front-cover?size=70x105" />
  <script type="application/ld+json">
  {
    "@context":"https://schema.org",
    "@type":"Product",
    "name":"After - Tome 01",
    "description":"Premier tome de la série After.",
    "url":"${PRODUCT_URL}",
    "isbn":"9782755620610",
    "bookFormat":"https://schema.org/EBook",
    "image":"https://cdn.vivlio.com/product/v1/128ddaf0/front-cover?size=70x105",
    "author":{"@type":"Person","name":"Anna Todd"},
    "publisher":{"@type":"Organization","name":"Hugo Roman"},
    "offers":{"@type":"Offer","priceCurrency":"EUR","price":0}
  }
  </script>
  <script type="application/ld+json">
  {
    "@context":"https://schema.org",
    "@type":"DataFeed",
    "dataFeedElement":{
      "@type":"Book",
      "name":"After - Tome 01",
      "isbn":"9782755620610",
      "author":{"@type":"Person","name":"Anna Todd"},
      "workExample":{
        "@type":"Book",
        "bookEdition":"Hugo Roman",
        "bookFormat":"https://schema.org/EBook",
        "isbn":"9782755620610",
        "datePublished":"2014-11-27"
      }
    }
  }
  </script>
  <script type="application/ld+json">
  {
    "@context":"https://schema.org",
    "@type":"BreadcrumbList",
    "itemListElement":[
      {"@type":"ListItem","position":1,"name":"Accueil","item":"https://shop.vivlio.com/"},
      {"@type":"ListItem","position":2,"name":"Ebooks","item":"https://shop.vivlio.com/category/ebooks/2979"},
      {"@type":"ListItem","position":3,"name":"Romance","item":"https://shop.vivlio.com/category/romance/3001"},
      {"@type":"ListItem","position":4,"name":"After - Tome 01","item":"${PRODUCT_URL}"}
    ]
  }
  </script>
</head><body>
  <a href="/serie/hugo-roman-after-episode/141721">After - Episode</a>
  <a href="/collection/hugo-roman-romance-psychologique/312280">Romance psychologique</a>
</body></html>`;
}

describe("vivlio", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    readVivlioSearchEvidence.mockReset();
    promoteVivlioSearchEvidence.mockReset();
    readVivlioSearchEvidence.mockResolvedValue(null);
    promoteVivlioSearchEvidence.mockResolvedValue(undefined);
  });

  it("construit l'URL search=", () => {
    expect(vivlioSearchUrl("Survivantes")).toContain("search=Survivantes");
  });

  it("parse les hits /product/ISBN_", () => {
    const hits = parseVivlioSearchHits(
      `<a href="/product/9782749961347_9782749961347_3/survivantes-le-thriller"></a>`,
    );
    expect(hits[0]).toMatchObject({
      barcode: "9782749961347",
      title: "survivantes le thriller",
    });
  });

  it("parse JSON-LD Product ebook + série / collection HTML", () => {
    const product = parseVivlioProductPage(productHtml(), PRODUCT_URL);
    expect(product).toMatchObject({
      title: "After - Tome 01",
      barcode: "9782755620610",
      authors: ["Anna Todd"],
      bookFormat: "EBook",
      priceCents: 0,
      seriesName: "After - Episode",
      collection: "Romance psychologique",
      releaseDate: "2014-11-27",
      categories: ["Romance"],
    });
    expect(normalizeVivlioCoverUrl(product?.imageUrl)).toContain(
      "size=450x675",
    );
  });

  it("réécrit les tailles CDN inventées vers l'allowlist Vivlio", () => {
    const broken =
      "https://cdn.vivlio.com/product/v1/52c61e79-3a55-4b8f-a6ff-612850dcd305/front-cover?size=400x600";
    expect(vivlioCoverDownloadCandidates(broken)).toEqual([
      "https://cdn.vivlio.com/product/v1/52c61e79-3a55-4b8f-a6ff-612850dcd305/front-cover?size=450x675",
      "https://cdn.vivlio.com/product/v1/52c61e79-3a55-4b8f-a6ff-612850dcd305/front-cover?size=160x240",
      "https://cdn.vivlio.com/product/v1/52c61e79-3a55-4b8f-a6ff-612850dcd305/front-cover?size=70x105",
    ]);
    expect(normalizeVivlioCoverUrl(broken)).toContain("size=450x675");
  });

  it("ne promeut pas l'ISBN ebook en barcode résultat", () => {
    const metadata = mapVivlioMetadata(
      parseVivlioProductPage(productHtml(), PRODUCT_URL),
    );
    expect(metadata?.barcode).toBeUndefined();
    expect(metadata?.facts?.find((f) => f.kind === "identifier")?.value).toBe(
      "9782755620610",
    );
    expect(metadata?.facts?.find((f) => f.kind === "series")?.value).toBe(
      "After - Episode",
    );
    expect(
      metadata?.facts?.some(
        (f) => f.kind === "tag" && f.label === "Collection",
      ),
    ).toBe(true);
    expect(
      metadata?.facts?.find((f) => f.kind === "tag" && f.label === "Format")
        ?.value,
    ).toBe("Ebook");
  });

  it("extrait l'ISBN produit depuis une URL fiche mémorisée", () => {
    expect(vivlioModule.parseMetadataRecordIdFromUrl?.(PRODUCT_URL)).toBe(
      "9782755620610",
    );
    expect(
      vivlioModule.parseMetadataRecordIdFromUrl?.(
        "https://example.com/product/9782749961347_x",
      ),
    ).toBeNull();
  });

  it("réutilise ProviderEvidence SearchYield sans HTTP", async () => {
    const hits = [
      {
        title: "survivantes le thriller",
        productUrl:
          "https://shop.vivlio.com/product/9782749961347_9782749961347_3/survivantes-le-thriller",
        barcode: "9782749961347",
      },
    ];
    readVivlioSearchEvidence.mockResolvedValueOnce(hits);

    await expect(searchVivlioHits("Survivantes")).resolves.toEqual(hits);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(promoteVivlioSearchEvidence).not.toHaveBeenCalled();
  });

  it("promotes SearchYield after a live search GET", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: `<a href="/product/9782749961347_9782749961347_3/survivantes-le-thriller"></a>`,
    } as never);

    const hits = await searchVivlioHits("Survivantes");
    expect(hits[0]).toMatchObject({ barcode: "9782749961347" });
    expect(promoteVivlioSearchEvidence).toHaveBeenCalledWith(
      expect.stringContaining("/search?search=Survivantes"),
      expect.arrayContaining([
        expect.objectContaining({ barcode: "9782749961347" }),
      ]),
    );
  });
});
