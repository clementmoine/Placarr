import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readChasseSearchEvidence = vi.fn();
const promoteChasseSearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  readChasseSearchEvidence: (...args: unknown[]) =>
    readChasseSearchEvidence(...args),
  promoteChasseSearchEvidence: (...args: unknown[]) =>
    promoteChasseSearchEvidence(...args),
}));

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
vi.mock("@/lib/http/flareSolverr", () => ({
  flareSolverrRequestGet: vi.fn().mockResolvedValue(null),
  flareSolverrDestroySession: vi.fn().mockResolvedValue(undefined),
}));

import {
  chasseOfferLandedPriceCents,
  extractChasseAuxLivresProductImages,
  fetchChasseAuxLivresMetadataProduct,
  fetchFromChasseAuxLivres,
  orderChasseSearchHits,
  parseChasseAuxLivresProductPage,
} from "./fetch";

import {
  flareSolverrDestroySession,
  flareSolverrRequestGet,
} from "@/lib/http/flareSolverr";

const mockedGet = vi.mocked(axios.get);
const mockedFlare = vi.mocked(flareSolverrRequestGet);
const mockedFlareDestroy = vi.mocked(flareSolverrDestroySession);

describe("orderChasseSearchHits", () => {
  it("soft-filters listing titles with validateProduct before any fiche GET", () => {
    const ordered = orderChasseSearchHits(
      [
        {
          name: "Super Picsou géant",
          productUrl:
            "https://www.chasse-aux-livres.fr/prix/2092662422/super-picsou-geant",
        },
        {
          name: "Super picsou geant N° 1",
          productUrl:
            "https://www.chasse-aux-livres.fr/prix/P109843183/super-picsou-geant-n-1",
        },
      ],
      {
        validateProduct: (candidate) => /n[°º]?\s*1\b/i.test(candidate.name),
      },
    );
    expect(ordered).toHaveLength(1);
    expect(ordered[0]?.productUrl).toContain("P109843183");
  });

  it("prefers listing URLs that already embed the item barcode", () => {
    const barcode = "9782070368228";
    const ordered = orderChasseSearchHits(
      [
        {
          name: "Wrong book",
          productUrl: "https://www.chasse-aux-livres.fr/prix/AAA/wrong-book",
        },
        {
          name: "1984",
          productUrl: `https://www.chasse-aux-livres.fr/prix/BBB/1984-${barcode}`,
        },
      ],
      { anchoredBarcode: barcode },
    );
    expect(ordered[0]?.productUrl).toContain(barcode);
  });
});

describe("parseChasseAuxLivresProductPage", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedFlare.mockReset();
    mockedFlare.mockResolvedValue(null);
    mockedFlareDestroy.mockReset();
    mockedFlareDestroy.mockResolvedValue(undefined);
    readChasseSearchEvidence.mockReset();
    promoteChasseSearchEvidence.mockReset();
    readChasseSearchEvidence.mockResolvedValue(null);
    promoteChasseSearchEvidence.mockResolvedValue(undefined);
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

  it("collects all img.chasse-aux-livres.fr gallery photos from a product page", () => {
    const html = `
      <html><head>
        <meta property="og:title" content="L'Art et la Création de Arcane"/>
      </head><body>
        <div id="book-details" data-thumbs="[{&quot;thumb&quot;:&quot;https://img.chasse-aux-livres.fr/v7/_zmx1_/61+3VWwlrqL.jpg?w=96&quot;,&quot;full&quot;:&quot;https://img.chasse-aux-livres.fr/v7/_zmx1_/61+3VWwlrqL.jpg?w=1000&quot;},{&quot;thumb&quot;:&quot;https://img.chasse-aux-livres.fr/v7/_zmx1_/51B-AlWhOgL.jpg?w=96&quot;,&quot;full&quot;:&quot;https://img.chasse-aux-livres.fr/v7/_zmx1_/51B-AlWhOgL.jpg?w=1000&quot;},{&quot;thumb&quot;:&quot;https://img.chasse-aux-livres.fr/v7/_zmx1_/51dD1--GPBL.jpg?w=96&quot;,&quot;full&quot;:&quot;https://img.chasse-aux-livres.fr/v7/_zmx1_/51dD1--GPBL.jpg?w=1000&quot;}]">
          <img id="book-cover" src="https://img.chasse-aux-livres.fr/v7/_zmx1_/51dD1--GPBL.jpg?w=1000"/>
        </div>
      </body></html>`;

    expect(extractChasseAuxLivresProductImages(html)).toEqual([
      "https://img.chasse-aux-livres.fr/v7/_zmx1_/61+3VWwlrqL.jpg",
      "https://img.chasse-aux-livres.fr/v7/_zmx1_/51B-AlWhOgL.jpg",
      "https://img.chasse-aux-livres.fr/v7/_zmx1_/51dD1--GPBL.jpg",
    ]);

    const product = parseChasseAuxLivresProductPage(
      html,
      "https://www.chasse-aux-livres.fr/prix/B0D6XT35F8/l-art-et-la-creation-de-arcane-league-of-legends",
    );
    expect(product?.images).toHaveLength(3);
    expect(product?.coverUrl).toBe(
      "https://img.chasse-aux-livres.fr/v7/_zmx1_/51dD1--GPBL.jpg",
    );
  });

  it("ignore les vignettes marketplace dans #offers", () => {
    const html = `
      <html><body>
        <div id="book-details" data-thumbs="[{&quot;thumb&quot;:&quot;https://img.chasse-aux-livres.fr/v7/_zmx1_/51WWyFcJVlL.jpg?w=96&quot;,&quot;full&quot;:&quot;https://img.chasse-aux-livres.fr/v7/_zmx1_/51WWyFcJVlL.jpg?w=1000&quot;},{&quot;thumb&quot;:&quot;https://img.chasse-aux-livres.fr/v7/_zmx1_/61+3VWwlrqL.jpg?w=96&quot;,&quot;full&quot;:&quot;https://img.chasse-aux-livres.fr/v7/_zmx1_/61+3VWwlrqL.jpg?w=1000&quot;}]">
          <img id="book-cover" src="https://img.chasse-aux-livres.fr/v7/_zmx1_/51WWyFcJVlL.jpg?w=300"/>
        </div>
        <div id="offers">
          <img src="https://img.chasse-aux-livres.fr/v7/_zmx1_/41uJb6LmGjL.jpg?w=96" alt="Roman Arcane/League of Legends - Ambessa"/>
          <img src="https://img.chasse-aux-livres.fr/v7/_zmx1_/41gMxwr+9bL.jpg?w=96" alt="Le monde du Studio Ghibli"/>
          <img src="https://img.chasse-aux-livres.fr/v7/_c_/images/v2/dark-logo-440.png" alt="logo"/>
        </div>
      </body></html>`;

    expect(extractChasseAuxLivresProductImages(html)).toEqual([
      "https://img.chasse-aux-livres.fr/v7/_zmx1_/51WWyFcJVlL.jpg",
      "https://img.chasse-aux-livres.fr/v7/_zmx1_/61+3VWwlrqL.jpg",
    ]);
  });

  it("retombe sur les img du header quand data-thumbs est absent", () => {
    const html = `
      <html><body>
        <img src="https://img.chasse-aux-livres.fr/v7/_zmx1_/61+3VWwlrqL.jpg?w=1000&h=1000"/>
        <img src="https://img.chasse-aux-livres.fr/v7/_zmx1_/51B-AlWhOgL.jpg?w=1000&h=1000"/>
        <img id="book-cover" src="https://img.chasse-aux-livres.fr/v7/_zmx1_/51dD1--GPBL.jpg?w=1000"/>
      </body></html>`;

    expect(extractChasseAuxLivresProductImages(html)).toEqual([
      "https://img.chasse-aux-livres.fr/v7/_zmx1_/61+3VWwlrqL.jpg",
      "https://img.chasse-aux-livres.fr/v7/_zmx1_/51B-AlWhOgL.jpg",
      "https://img.chasse-aux-livres.fr/v7/_zmx1_/51dD1--GPBL.jpg",
    ]);
  });

  it("mine SearchYield puis ne charge que la fiche du gagnant (pas N /prix/)", async () => {
    const fetchedPrix: string[] = [];
    mockedGet.mockImplementation(async (url: string) => {
      if (url.includes("/search?")) {
        return {
          data: '<html><body data-hash="hash-123"></body></html>',
          request: { res: { responseUrl: url } },
        };
      }
      if (url.includes("/rest/search-results") && url.includes("p=1")) {
        return {
          data: {
            c: 2,
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
      if (url.includes("/prix/")) {
        fetchedPrix.push(url);
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
        withPrices: false,
      },
    );

    expect(product).toMatchObject({
      name: "Super picsou geant N° 1",
      sku: "P109843183",
      productUrl:
        "https://www.chasse-aux-livres.fr/prix/P109843183/super-picsou-geant-n-1",
    });
    expect(fetchedPrix).toHaveLength(1);
    expect(fetchedPrix[0]).toContain("P109843183");
    expect(promoteChasseSearchEvidence).toHaveBeenCalledWith(
      "https://www.chasse-aux-livres.fr/search?query=Super%20Picsou%20G%C3%A9ant%20n%C2%B001&catalog=fr",
      expect.arrayContaining([
        expect.objectContaining({
          productUrl: expect.stringContaining("P109843183"),
        }),
      ]),
    );
  });

  it("réutilise ProviderEvidence SearchYield sans search/REST", async () => {
    readChasseSearchEvidence.mockResolvedValueOnce([
      {
        name: "Super Picsou géant",
        productUrl:
          "https://www.chasse-aux-livres.fr/prix/2092662422/super-picsou-geant",
      },
      {
        name: "Super picsou geant N° 1",
        productUrl:
          "https://www.chasse-aux-livres.fr/prix/P109843183/super-picsou-geant-n-1",
      },
    ]);
    mockedGet.mockImplementation(async (url: string) => {
      if (url.includes("/search?") || url.includes("/rest/search-results")) {
        throw new Error(`Should not fetch search/REST: ${url}`);
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
        withPrices: false,
      },
    );

    expect(product).toMatchObject({
      name: "Super picsou geant N° 1",
      sku: "P109843183",
    });
    expect(promoteChasseSearchEvidence).not.toHaveBeenCalled();
  });

  it("prefere un candidat barcode-confirme pour Black Stories", async () => {
    const itemBarcode = "0827912079678";
    mockedGet.mockImplementation(async (url: string) => {
      if (url.includes("/search?")) {
        return {
          data: '<html><body><div id="hash-cont" data-hash="hash-bs" data-duih=""></div></body></html>',
          request: { res: { responseUrl: url } },
        };
      }
      if (url.includes("/rest/search-results") && url.includes("p=1")) {
        return {
          data: {
            c: 1,
            d: `
              <a href="/prix/B071ZXH7MV/black-stories-fantastique">
                <img src="https://img.example/fantastique.jpg" alt="Black Stories Fantastique"/>
              </a>
            `,
          },
        };
      }
      if (url.includes("/rest/search-results") && url.includes("p=2")) {
        return {
          data: {
            c: 1,
            d: `
              <a href="/prix/B001K9E2SQ/iello-black-stories">
                <img src="https://img.example/classic.jpg" alt="Iello Black Stories"/>
              </a>
            `,
          },
        };
      }
      if (url.includes("black-stories-fantastique")) {
        return {
          data: productHtml({
            name: "Black Stories Fantastique",
            sku: "B071ZXH7MV",
            image: "https://img.example/fantastique.jpg",
          }),
          request: {
            res: {
              responseUrl:
                "https://www.chasse-aux-livres.fr/prix/B071ZXH7MV/black-stories-fantastique",
            },
          },
        };
      }
      if (url.includes("iello-black-stories")) {
        return {
          data: productHtml({
            name: "Iello Black Stories",
            sku: "B001K9E2SQ",
            image: "https://img.example/classic.jpg",
            gtin13: itemBarcode,
          }),
          request: {
            res: {
              responseUrl:
                "https://www.chasse-aux-livres.fr/prix/B001K9E2SQ/iello-black-stories",
            },
          },
        };
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const product = await fetchChasseAuxLivresMetadataProduct(
      itemBarcode,
      "toys",
      { anchoredItemBarcode: itemBarcode, withPrices: false },
    );

    expect(product).toMatchObject({
      name: "Iello Black Stories",
      barcode: itemBarcode,
      productUrl:
        "https://www.chasse-aux-livres.fr/prix/B001K9E2SQ/iello-black-stories",
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
      "fr",
      { withPrices: false },
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
      expect(mockedFlare).toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe("fetchFromChasseAuxLivres", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedFlare.mockReset();
    mockedFlare.mockResolvedValue(null);
    mockedFlareDestroy.mockReset();
    mockedFlareDestroy.mockResolvedValue(undefined);
    readChasseSearchEvidence.mockReset();
    promoteChasseSearchEvidence.mockReset();
    readChasseSearchEvidence.mockResolvedValue(null);
    promoteChasseSearchEvidence.mockResolvedValue(undefined);
  });

  it("retombe sur FlareSolverr quand la page recherche directe n'expose pas de hash", async () => {
    mockedGet.mockResolvedValueOnce({
      data: "<html><body>anti-bot shell without hash</body></html>",
      request: {
        res: {
          responseUrl:
            "https://www.chasse-aux-livres.fr/search?query=Black%20Stories&catalog=toys",
        },
      },
    });
    mockedFlare
      .mockResolvedValueOnce(
        '<html><body><div id="hash-cont" data-hash="flare-hash" data-duih=""></div></body></html>',
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          c: 1,
          d: '<a href="/prix/B001K9E2SQ/iello-black-stories"><img src="https://img.example/classic.jpg" alt="Iello Black Stories"/></a>',
        }),
      )
      .mockResolvedValueOnce(
        productHtml({
          name: "Iello Black Stories",
          sku: "B001K9E2SQ",
          image: "https://img.example/classic.jpg",
          gtin13: "0827912079678",
        }),
      );

    const product = await fetchChasseAuxLivresMetadataProduct(
      "Black Stories",
      "toys",
      { anchoredItemBarcode: "0827912079678", withPrices: false },
    );

    expect(product?.sku).toBe("B001K9E2SQ");
    expect(mockedFlare).toHaveBeenCalled();
  });

  it("utilise FlareSolverr quand la recherche directe renvoie une page login", async () => {
    mockedGet.mockResolvedValueOnce({
      data: "<html><title>Connexion - Chasse aux livres</title></html>",
      request: {
        res: {
          responseUrl: "https://www.chasse-aux-livres.fr/login?protect=true",
        },
      },
    });
    mockedFlare
      .mockResolvedValueOnce(
        '<html><body><div id="hash-cont" data-hash="flare-hash" data-duih=""></div></body></html>',
      )
      .mockResolvedValueOnce('{"c":0,"d":""}');

    const products = await fetchFromChasseAuxLivres("9780140328721", "fr");

    expect(products).toEqual([]);
    expect(mockedFlare).toHaveBeenNthCalledWith(
      1,
      "https://www.chasse-aux-livres.fr/search?query=9780140328721&catalog=fr",
      expect.objectContaining({
        maxTimeoutMs: 25_000,
        session: expect.any(String),
      }),
    );
    expect(mockedFlare).toHaveBeenNthCalledWith(
      2,
      "https://www.chasse-aux-livres.fr/rest/search-results?h=flare-hash&p=1&l=1&duih=",
      expect.objectContaining({
        maxTimeoutMs: 25_000,
        session: expect.any(String),
      }),
    );
    expect(mockedFlareDestroy).toHaveBeenCalled();
  });

  it("attache les meilleurs prix marketplace sur le chemin metadata", async () => {
    const productUrl =
      "https://www.chasse-aux-livres.fr/prix/P109843183/super-picsou-geant-n-1";
    mockedGet.mockImplementation(async (url: string) => {
      if (url === productUrl || url.includes("/prix/P109843183")) {
        return {
          data: `
            <html data-duih="duih1">
              <body>
                <div id="book-details" data-asin="P109843183" data-fuzz="false"></div>
                <div id="offers" data-nbeng="1"></div>
                <div id="d-tp-lnk" data-ui="ui1"></div>
                <div data-lvs="lvs1"></div>
                <script type="application/ld+json">
                  {
                    "@type": ["Product", "Book"],
                    "name": "Super picsou geant N° 1",
                    "sku": "P109843183",
                    "publisher": {"name": "Edi Monde"},
                    "image": "https://img.example/n1.jpg"
                  }
                </script>
              </body>
            </html>
          `,
          request: { res: { responseUrl: productUrl } },
        };
      }
      if (url.includes("/rest/lookup/results")) {
        return {
          data: {
            offers: {
              eng0: [
                {
                  condition: { _name: "NEW" },
                  price: { amount: 730 },
                  shippingCost: { amount: 0 },
                  totalPrice: { amount: 730 },
                },
                {
                  condition: { _name: "USED" },
                  price: { amount: 198 },
                  shippingCost: { amount: 0 },
                  totalPrice: { amount: 198 },
                },
              ],
            },
          },
        };
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const product = await fetchChasseAuxLivresMetadataProduct(productUrl, "fr");
    expect(product).toMatchObject({
      name: "Super picsou geant N° 1",
      publisher: "Edi Monde",
      priceNew: 730,
      priceUsed: 198,
    });
  });
});

describe("chasseOfferLandedPriceCents", () => {
  it("prefers totalPrice when present (recap Meilleur prix)", () => {
    expect(
      chasseOfferLandedPriceCents({
        price: { amount: 1745 },
        shippingCost: { amount: 299 },
        totalPrice: { amount: 2044 },
      }),
    ).toBe(2044);
  });

  it("sums item price, shipping and fees when totalPrice is absent", () => {
    expect(
      chasseOfferLandedPriceCents({
        price: { amount: 580 },
        shippingCost: { amount: 399 },
        fees: { amount: 0 },
      }),
    ).toBe(979);
  });
});

function productHtml({
  name,
  sku,
  image,
  gtin13,
}: {
  name: string;
  sku: string;
  image: string;
  gtin13?: string;
}) {
  const gtinField = gtin13 ? `,"gtin13": ${JSON.stringify(gtin13)}` : "";
  return `
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": ["Product", "Book"],
            "name": ${JSON.stringify(name)},
            "sku": ${JSON.stringify(sku)},
            "image": ${JSON.stringify(image)}${gtinField}
          }
        </script>
      </head>
      <body></body>
    </html>
  `;
}
