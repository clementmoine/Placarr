import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchBooknodeMetadata,
  parseBooknodeBookPage,
  parseBooknodeSearchCandidates,
} from "./fetch";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedGet = vi.mocked(axios.get);
const mockedPost = vi.mocked(axios.post);
const ORIGINAL_FLARESOLVERR_URL = process.env.FLARESOLVERR_URL;

describe("Booknode provider", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedPost.mockReset();
    delete process.env.FLARESOLVERR_URL;
  });

  afterEach(() => {
    if (ORIGINAL_FLARESOLVERR_URL) {
      process.env.FLARESOLVERR_URL = ORIGINAL_FLARESOLVERR_URL;
    } else {
      delete process.env.FLARESOLVERR_URL;
    }
  });

  it("exploite les donnees structurees JSON-LD d'une fiche Booknode", () => {
    const book = parseBooknodeBookPage(
      bookHtml(),
      "https://booknode.com/super_picsou_geant_n_1_0379552",
    );

    expect(book).toMatchObject({
      id: "0379552",
      title: "Super Picsou Geant n°1",
      sourceUrl: "https://booknode.com/super_picsou_geant_n_1_0379552",
      imageUrl:
        "https://cdn1.booknode.com/book_cover/1691/full/super-picsou-geant-n1-1691432.jpg",
      description: expect.stringContaining("Picsou et les mousquetaires"),
      authors: ["Super Picsou Geant"],
      genres: ["Bande dessinee", "Humour", "Aventure", "Walt Disney"],
      ratingValue: 8.33,
      ratingCount: 147,
      reviewCount: 8,
      seriesName: "Super Picsou Geant",
      seriesUrl: "https://booknode.com/serie/super-picsou-geant",
      seriesPosition: 1,
    });
  });

  it("exploite la version Markdown Reader d'une fiche Booknode", () => {
    const book = parseBooknodeBookPage(
      bookMarkdown(),
      "https://booknode.com/super_picsou_geant_n_1_0379552",
    );

    expect(book).toMatchObject({
      title: "Super Picsou Geant n°1",
      imageUrl:
        "https://cdn1.booknode.com/book_cover/1691/full/super-picsou-geant-n1-1691432.jpg",
      description: expect.stringContaining("Picsou et les mousquetaires"),
      authors: ["Super Picsou Geant"],
      genres: ["Bande dessinee", "Humour", "Aventure", "Gags", "Walt Disney"],
      ratingCount: 147,
      reviewCount: 8,
      seriesName: "Super Picsou Geant",
      seriesUrl: "https://booknode.com/serie/super-picsou-geant",
      seriesPosition: 1,
    });
  });

  it("ignore les liens image et conserve les fiches livres dans les resultats de recherche", () => {
    const candidates = parseBooknodeSearchCandidates(`
      [![Image 1](https://cdn.example/cover.jpg)](https://booknode.com/super_picsou_geant_n_1_0379552)
      [Super Picsou Geant n°1](https://booknode.com/super_picsou_geant_n_1_0379552)
      <a href="/serie/super-picsou-geant">Super Picsou Geant</a>
      <a href="/super_picsou_geant_n_2_0379553">Super Picsou Geant n°2</a>
    `);

    expect(candidates).toEqual([
      {
        title: "Super Picsou Geant n°1",
        url: "https://booknode.com/super_picsou_geant_n_1_0379552",
      },
      {
        title: "Super Picsou Geant n°2",
        url: "https://booknode.com/super_picsou_geant_n_2_0379553",
      },
    ]);
  });

  it("parcourt la recherche par nom et retient le numero exact demande", async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (url.includes("/search?")) {
        return {
          status: 200,
          data: `
            [Super Picsou Geant n°163](https://booknode.com/super_picsou_geant_n_163_0379714)
            [Super Picsou Geant n°1](https://booknode.com/super_picsou_geant_n1_0379552)
          `,
        };
      }
      if (url.includes("n_163")) {
        return {
          status: 200,
          data: bookHtml({ title: "Super Picsou Geant n°163" }),
        };
      }
      if (url.includes("n_1")) {
        return { status: 200, data: bookHtml() };
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const book = await fetchBooknodeMetadata("Super Picsou Geant n°01");

    expect(book).toMatchObject({
      title: "Super Picsou Geant n°1",
      imageUrl:
        "https://cdn1.booknode.com/book_cover/1691/full/super-picsou-geant-n1-1691432.jpg",
    });
    expect(mockedGet).not.toHaveBeenCalledWith(
      expect.stringContaining("n_163"),
      expect.anything(),
    );
    expect(mockedGet).toHaveBeenCalledWith(
      "https://booknode.com/super_picsou_geant_n_1_0379552",
      expect.anything(),
    );
  });

  it("utilise FlareSolverr quand Booknode bloque l'acces direct", async () => {
    process.env.FLARESOLVERR_URL = "http://flare.test";
    mockedGet.mockResolvedValueOnce({
      status: 403,
      data: "Attention Required! | Cloudflare",
    });
    mockedPost.mockResolvedValueOnce({
      data: {
        solution: {
          status: 200,
          response: bookHtml(),
        },
      },
    });

    const book = await fetchBooknodeMetadata(
      "https://booknode.com/super_picsou_geant_n_1_0379552",
    );

    expect(book?.title).toBe("Super Picsou Geant n°1");
    expect(mockedPost).toHaveBeenCalledWith(
      "http://flare.test/v1",
      expect.objectContaining({
        cmd: "request.get",
        url: "https://booknode.com/super_picsou_geant_n_1_0379552",
      }),
      expect.objectContaining({ timeout: 50000 }),
    );
  });

  it("utilise Reader avant FlareSolverr quand Booknode bloque l'acces direct", async () => {
    process.env.FLARESOLVERR_URL = "http://flare.test";
    mockedGet
      .mockResolvedValueOnce({
        status: 403,
        data: "Attention Required! | Cloudflare",
      })
      .mockResolvedValueOnce({
        status: 200,
        data: bookMarkdown(),
      });

    const book = await fetchBooknodeMetadata(
      "https://booknode.com/super_picsou_geant_n_1_0379552",
    );

    expect(book?.title).toBe("Super Picsou Geant n°1");
    expect(book?.imageUrl).toContain("cdn1.booknode.com/book_cover/");
    expect(mockedPost).not.toHaveBeenCalled();
    expect(mockedGet).toHaveBeenNthCalledWith(
      2,
      "https://r.jina.ai/http://r.jina.ai/http://https://booknode.com/super_picsou_geant_n_1_0379552",
      expect.objectContaining({ timeout: 12000 }),
    );
  });

  it("retourne null sans lever quand FlareSolverr timeoute", async () => {
    process.env.FLARESOLVERR_URL = "http://flare.test";
    mockedGet.mockResolvedValueOnce({
      status: 403,
      data: "Attention Required! | Cloudflare",
    });
    mockedPost.mockRejectedValueOnce(new Error("timeout"));

    await expect(
      fetchBooknodeMetadata(
        "https://booknode.com/super_picsou_geant_n_1_0379552",
      ),
    ).resolves.toBeNull();
  });
});

function bookHtml({
  title = "Super Picsou Geant n°1",
  image = "https://cdn1.booknode.com/book_cover/1691/full/super-picsou-geant-n1-1691432.jpg",
}: {
  title?: string;
  image?: string;
} = {}) {
  return `
    <html>
      <head>
        <meta property="og:title" content="${title} - Bande Dessinee de Super Picsou Geant"/>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Book",
            "@id": "https://booknode.com/#/schema/media/379552",
            "name": ${JSON.stringify(title)},
            "image": ${JSON.stringify(image)},
            "description": "Histoires:\\n\\nPicsou et les mousquetaires de l'espace. Attention... Donald travaille !",
            "author": [{ "@type": "Person", "name": "Super Picsou Geant" }],
            "genre": ["Bande dessinee", "Humour", "Aventure", "Walt Disney"],
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": 8.33,
              "ratingCount": 147,
              "bestRating": 10,
              "reviewCount": 8
            },
            "isPartOf": {
              "@type": "BookSeries",
              "name": "Super Picsou Geant",
              "url": "https://booknode.com/serie/super-picsou-geant",
              "position": 1
            }
          }
        </script>
      </head>
      <body>
        <h1>${title}</h1>
      </body>
    </html>
  `;
}

function bookMarkdown() {
  return `
Title: Super Picsou Geant n°1 - Bande Dessinee de Super Picsou Geant

URL Source: https://booknode.com/super_picsou_geant_n_1_0379552

Livres

847 439

Commentaires Comms

2 933 031

# Super Picsou Geant n°1

Bande Dessinee

147 notes | [8 commentaires](https://booknode.com/super_picsou_geant_n1_0379552/commentaires)

[![Image 5: Couverture du livre Super Picsou Geant n°1](https://cdn1.booknode.com/book_cover/1691/super_picsou_geant_n1-1691432-264-432.webp)](https://booknode.com/super_picsou_geant_n1_0379552/covers)

#### Auteur

* [Super Picsou Geant](https://booknode.com/auteur/super-picsou-geant)(Ecrivain)

#### Serie

[Super Picsou Geant (249 bandes dessinees)](https://booknode.com/serie/super-picsou-geant "Serie Super Picsou Geant")

#### Themes

[Bande dessinee](https://booknode.com/theme/bande-dessinee_41948), [Humour](https://booknode.com/theme/humour_422), [Aventure](https://booknode.com/theme/aventure_4125), [Gags](https://booknode.com/theme/gags_45585), [Walt Disney](https://booknode.com/theme/walt-disney_49826)

Resume

Histoires:

Picsou et les mousquetaires de l'espace

Attention... Donald travaille !

[Afficher en entier](javascript:void(0))
  `;
}
