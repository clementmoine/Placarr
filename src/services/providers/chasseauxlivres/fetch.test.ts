import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchChasseAuxLivresMetadataProduct,
  parseChasseAuxLivresProductPage,
} from "./fetch";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

const mockedGet = vi.mocked(axios.get);

describe("parseChasseAuxLivresProductPage", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("exploite les donnees structurees JSON-LD d'une fiche produit", () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="https://img.chasse-aux-livres.fr/fallback.jpg"/>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": ["Product", "Book"],
              "category": "Livres / Revues - Journaux",
              "name": "Super picsou geant N° 1",
              "url": "https://www.chasse-aux-livres.fr/prix/P109843183/super-picsou-geant-n-1",
              "image": "https://img.chasse-aux-livres.fr/v7/photo/1129169491.jpg?w=1200&h=1200",
              "description": "Paru chez Edi Monde - Comparez les offres en ligne.",
              "sku": "P109843183",
              "publisher": {"name": "Edi Monde", "@type": "Organization"},
              "aggregateRating": {
                "ratingValue": "4.9",
                "ratingCount": 16,
                "bestRating": "5",
                "worstRating": "1",
                "@type": "AggregateRating"
              }
            }
          </script>
        </head>
        <body></body>
      </html>
    `;

    const product = parseChasseAuxLivresProductPage(
      html,
      "https://www.chasse-aux-livres.fr/prix/P109843183/super-picsou-geant-n-1",
    );

    expect(product).toMatchObject({
      name: "Super picsou geant N° 1",
      productUrl:
        "https://www.chasse-aux-livres.fr/prix/P109843183/super-picsou-geant-n-1",
      sku: "P109843183",
      publisher: "Edi Monde",
      category: "Livres / Revues - Journaux",
      ratingValue: 4.9,
      ratingCount: 16,
      description: "Paru chez Edi Monde - Comparez les offres en ligne.",
    });
    expect(product?.coverUrl).toBe(
      "https://img.chasse-aux-livres.fr/v7/photo/1129169491.jpg",
    );
  });

  it("parcourt les candidats de recherche jusqu'a trouver le numero demande", async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (url.includes("/search?")) {
        return {
          data: '<html><body data-hash="hash-123"></body></html>',
          request: { res: { responseUrl: url } },
        };
      }
      if (url.includes("l=8")) {
        return {
          data: {
            d: `
              <a href="/prix/2092662422/super-picsou-geant-walt-disney-company">
                <img src="https://img.example/generic.jpg" alt="Super Picsou géant"/>
              </a>
              <a href="/prix/P109843183/super-picsou-geant-n-1">
                <img src="https://img.example/n1.jpg" alt="Super picsou geant N° 1"/>
              </a>
            `,
          },
        };
      }
      if (url.includes("2092662422")) {
        return {
          data: productHtml({
            name: "Super Picsou géant",
            sku: "2092662422",
            image: "https://img.example/generic.jpg",
          }),
          request: { res: { responseUrl: url } },
        };
      }
      if (url.includes("P109843183")) {
        return {
          data: productHtml({
            name: "Super picsou geant N° 1",
            sku: "P109843183",
            image: "https://img.example/n1.jpg",
          }),
          request: { res: { responseUrl: url } },
        };
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const product = await fetchChasseAuxLivresMetadataProduct(
      "Super Picsou Géant n°01",
      "fr",
      {
        validateProduct: (candidate) => /n[°º]?\s*1\b/i.test(candidate.name),
      },
    );

    expect(product).toMatchObject({
      name: "Super picsou geant N° 1",
      sku: "P109843183",
      productUrl:
        "https://www.chasse-aux-livres.fr/prix/P109843183/super-picsou-geant-n-1",
    });
  });

  it("exploite directement une URL produit Chasse aux Livres", async () => {
    mockedGet.mockResolvedValueOnce({
      data: productHtml({
        name: "Super Picsou géant n° 4",
        sku: "P005643895",
        image: "https://img.example/n4.jpg",
      }),
      request: {
        res: {
          responseUrl:
            "https://www.chasse-aux-livres.fr/prix/P005643895/super-picsou-geant-n-4",
        },
      },
    });

    const product = await fetchChasseAuxLivresMetadataProduct(
      "https://www.chasse-aux-livres.fr/prix/P005643895/super-picsou-geant-n-4",
    );

    expect(product?.name).toBe("Super Picsou géant n° 4");
    expect(product?.sku).toBe("P005643895");
  });

  it("echoue proprement et avec timeout quand Chasse est indisponible", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedGet.mockRejectedValueOnce(
      Object.assign(new Error("timeout"), { code: "ECONNABORTED" }),
    );

    try {
      const product = await fetchChasseAuxLivresMetadataProduct(
        "Super Picsou Géant n°01",
        "fr",
      );

      expect(product).toBeNull();
      expect(mockedGet).toHaveBeenCalledWith(
        "https://www.chasse-aux-livres.fr/search?query=Super%20Picsou%20G%C3%A9ant%20n%C2%B001&catalog=fr",
        expect.objectContaining({ timeout: 8000 }),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[ChasseAuxLivres] Metadata lookup failed"),
      );
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

function productHtml({
  name,
  sku,
  image,
}: {
  name: string;
  sku: string;
  image: string;
}) {
  return `
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": ["Product", "Book"],
            "name": ${JSON.stringify(name)},
            "sku": ${JSON.stringify(sku)},
            "image": ${JSON.stringify(image)}
          }
        </script>
      </head>
      <body></body>
    </html>
  `;
}
