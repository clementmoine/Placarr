import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

const readBedethequeSeriesEvidence = vi.fn();
const promoteBedethequeSeriesEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  readBedethequeSeriesEvidence: (...args: unknown[]) =>
    readBedethequeSeriesEvidence(...args),
  promoteBedethequeSeriesEvidence: (...args: unknown[]) =>
    promoteBedethequeSeriesEvidence(...args),
}));

import {
  fetchBedethequeMetadata,
  parseBedethequeAlbumInfoFields,
  parseBedethequeAlbumPage,
  parseBedethequeCreditedRoles,
  parseBedethequeMediaUrls,
  parseBedethequeSaleListings,
  parseBedethequeRetailPrices,
  parseBedethequeSeriesAlbumEntries,
  parseBedethequeSeriesAlbumLinks,
  pickBedethequeAlbumLink,
  pickBedethequeHorsSerieAlbumPath,
  pickBedethequeSeriesCandidate,
  rankBedethequeSeriesCandidates,
  bedethequeAlbumMatchesBarcode,
  isKnownBedethequePriceEstimate,
  searchBedethequeSeries,
} from "./fetch";

const mockedGet = vi.mocked(axios.get);

describe("bedetheque fetch", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    readBedethequeSeriesEvidence.mockReset();
    promoteBedethequeSeriesEvidence.mockReset();
    readBedethequeSeriesEvidence.mockResolvedValue(null);
    promoteBedethequeSeriesEvidence.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parse une fiche album à partir des metas et champs structurels", () => {
    const album = parseBedethequeAlbumPage(
      albumHtml(),
      "https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-7-Numero-7-56641.html",
    );

    expect(album).toMatchObject({
      id: "56641",
      seriesName: "Super Picsou Géant",
      seriesPosition: 7,
      publisher: "EDI-Monde",
      releaseYear: 1984,
      pageCount: 192,
      format: "Format normal",
      weight: "390 g",
      priceEstimate: "de 5 à 10 euros",
      legalDeposit: "05/1983",
      genre: "Europe - Jeunesse",
      imageUrl: "https://www.bedetheque.com/media/Couvertures/Couv_56641.jpg",
      ratingValue: 4,
      ratingCount: 5,
    });
    expect(album?.title).toBe("Super Picsou Géant n°7");
    expect(album?.description).toContain("Picsou et les mousquetaires");
    expect(album?.credits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "Scénario",
          names: expect.arrayContaining(["Barosso, Abramo"]),
        }),
        expect.objectContaining({
          role: "Dessin",
          names: expect.arrayContaining(["Croci, Patrice"]),
        }),
      ]),
    );
  });

  it("parse les champs label de la fiche album", () => {
    expect(parseBedethequeAlbumInfoFields(albumHtml())).toMatchObject({
      planches: "192",
      format: "Format normal",
      poids: "390 g",
      estimation: "de 5 à 10 euros",
      "dépot légal": "05/1983",
      editeur: "EDI-Monde",
    });
  });

  it("ignore les estimations « non coté » (absence de cote marché)", () => {
    expect(isKnownBedethequePriceEstimate("non coté")).toBe(false);
    expect(isKnownBedethequePriceEstimate("non côté")).toBe(false);
    expect(isKnownBedethequePriceEstimate("de 5 à 10 euros")).toBe(true);

    const album = parseBedethequeAlbumPage(
      albumHtml({ priceEstimate: "non coté" }),
      "https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-7-Numero-7-56641.html",
    );

    expect(album?.priceEstimate).toBeUndefined();
  });

  it("parse le numéro d'album des tomes récents sans « Numéro » dans l'URL", () => {
    const album = parseBedethequeAlbumPage(
      modernTomeAlbumHtml(),
      "https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-178-Picsou-Contre-Gripsou-204343.html",
    );

    expect(album).toMatchObject({
      id: "204343",
      title: "Super Picsou Géant n°178",
      seriesPosition: 178,
    });
  });

  it("groupe les auteurs par métier BD", () => {
    const credits = parseBedethequeCreditedRoles(albumHtml());
    expect(credits.find((entry) => entry.role === "Scénario")?.names).toEqual([
      "Barosso, Abramo",
    ]);
    expect(credits.find((entry) => entry.role === "Couverture")?.names).toEqual([
      "Croci, Patrice",
      "Guillaume, René",
    ]);
  });

  it("extrait les URLs media (couverture, verso, planches) depuis la fiche", () => {
    const html = albumHtml({
      extraMedia: `
        <a href="https://www.bedetheque.com/media/Versos/Verso_56641.jpg">verso</a>
        <a href="https://www.bedetheque.com/media/Planches/PlancheA_56641.jpg">planche</a>
      `,
    });
    const media = parseBedethequeMediaUrls(html);
    expect(media).toEqual(
      expect.arrayContaining([
        {
          url: "https://www.bedetheque.com/media/Couvertures/Couv_56641.jpg",
          mediaKind: "Couvertures",
        },
        {
          url: "https://www.bedetheque.com/media/Versos/Verso_56641.jpg",
          mediaKind: "Versos",
        },
        {
          url: "https://www.bedetheque.com/media/Planches/PlancheA_56641.jpg",
          mediaKind: "Planches",
        },
      ]),
    );

    const album = parseBedethequeAlbumPage(
      html,
      "https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-7-Numero-7-56641.html",
    );
    expect(album?.media?.length).toBe(3);
  });

  it("extrait les annonces marketplace depuis une fiche album", () => {
    const html = albumHtml({
      saleRows: `
        <tr role="row" id="Vente_123">
          <td class="tdv">1. Tome 1</td>
          <td class="tdv"><a href="https://www.bedetheque.com/ventes/search?RechVendeur=rcdb"><u>rcdb</u></a></td>
          <td class="tdv"><b>Comme neuf</b></td>
          <td class="tdv dt-right prix-annonce">19.99€</td>
        </tr>
        <tr role="row" id="Vente_456">
          <td class="tdv">1. Tome 1</td>
          <td class="tdv"><a href="https://www.bedetheque.com/ventes/search?RechVendeur=alice"><u>alice</u></a></td>
          <td class="tdv"><b>Très bon état</b></td>
          <td class="tdv dt-right prix-annonce">14.00€</td>
        </tr>
      `,
    });
    const listings = parseBedethequeSaleListings(html);
    expect(listings).toEqual([
      {
        listingId: "456",
        seller: "alice",
        condition: "Très bon état",
        priceCents: 1400,
      },
      {
        listingId: "123",
        seller: "rcdb",
        condition: "Comme neuf",
        priceCents: 1999,
      },
    ]);

    const album = parseBedethequeAlbumPage(
      html,
      "https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-7-Numero-7-56641.html",
    );
    expect(album?.saleListings?.length).toBe(2);
  });

  it("extrait le prix neuf BDfugue quand il est rendu dans le HTML", () => {
    const retail = parseBedethequeRetailPrices(
      albumHtml({ retailNewPrice: "7.90" }),
    );
    expect(retail).toEqual({ priceNewCents: 790 });

    const album = parseBedethequeAlbumPage(
      albumHtml({ retailNewPrice: "7.90" }),
      "https://www.bedetheque.com/BD-Dragon-Ball-Z-Tome-1-1re-partie-Les-Saiyens-1-110422.html",
    );
    expect(album?.retailPrices).toEqual({ priceNewCents: 790 });
  });

  it("extrait un titre original depuis le nom de série entre parenthèses", () => {
    const album = parseBedethequeAlbumPage(
      albumHtml({
        seriesTitle: "L&#39;Attaque des Titans (Shingeki no Kyojin)",
      }),
      "https://www.bedetheque.com/BD-L-Attaque-Des-Titans-Tome-1-Numero-1-1.html",
    );

    expect(album?.alternateTitles).toContain("Shingeki no Kyojin");
  });

  it("extrait les liens d'albums numérotés depuis une fiche série", () => {
    const links = parseBedethequeSeriesAlbumLinks(`
      <a href="https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-7-Numero-7-56641.html">7</a>
      <a href="https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-2-Numero-2-478947.html">2</a>
    `);

    expect(links).toEqual([
      {
        issue: "7",
        albumId: "56641",
        albumPath: "BD-Super-Picsou-Geant-Tome-7-Numero-7-56641.html",
      },
      {
        issue: "2",
        albumId: "478947",
        albumPath: "BD-Super-Picsou-Geant-Tome-2-Numero-2-478947.html",
      },
    ]);
    expect(pickBedethequeAlbumLink(links, "7")).toBe(
      "BD-Super-Picsou-Geant-Tome-7-Numero-7-56641.html",
    );
  });

  it("extrait les liens Tome actuels de Bédéthèque", () => {
    const links = parseBedethequeSeriesAlbumLinks(`
      <a href="https://www.bedetheque.com/BD-Naruto-Tome-1-Naruto-Uzumaki-24065.html">1</a>
      <a href="https://www.bedetheque.com/BD-Naruto-Tome-2-Un-client-embarrassant-24064.html">2</a>
    `);

    expect(links).toEqual([
      {
        issue: "1",
        albumId: "24065",
        albumPath: "BD-Naruto-Tome-1-Naruto-Uzumaki-24065.html",
      },
      {
        issue: "2",
        albumId: "24064",
        albumPath: "BD-Naruto-Tome-2-Un-client-embarrassant-24064.html",
      },
    ]);
  });

  it("extrait les liens d'albums bis (Tome-100Bis / Numero-100-Bis)", () => {
    const links = parseBedethequeSeriesAlbumLinks(`
      <a href="https://www.bedetheque.com/BD-Super-Picsou-Geant-Supplement-Picsou-Magazine-Tome-100Bis-Numero-100-Bis-75048.html">100 Bis</a>
      <a href="https://www.bedetheque.com/BD-Super-Picsou-Geant-Supplement-Picsou-Magazine-Tome-97Bis-Numero-97-Bis-87680.html">97 Bis</a>
    `);

    expect(links).toEqual([
      {
        issue: "100bis",
        albumId: "75048",
        albumPath:
          "BD-Super-Picsou-Geant-Supplement-Picsou-Magazine-Tome-100Bis-Numero-100-Bis-75048.html",
      },
      {
        issue: "97bis",
        albumId: "87680",
        albumPath:
          "BD-Super-Picsou-Geant-Supplement-Picsou-Magazine-Tome-97Bis-Numero-97-Bis-87680.html",
      },
    ]);
    expect(pickBedethequeAlbumLink(links, "100bis")).toBe(
      "BD-Super-Picsou-Geant-Supplement-Picsou-Magazine-Tome-100Bis-Numero-100-Bis-75048.html",
    );
    expect(pickBedethequeAlbumLink(links, "100")).toBeNull();
  });

  it("parse la fiche d'un numéro bis (h2 « 100Bis. ») sans le confondre avec le 100", () => {
    const album = parseBedethequeAlbumPage(
      bisAlbumHtml(),
      "https://www.bedetheque.com/BD-Super-Picsou-Geant-Supplement-Picsou-Magazine-Tome-100Bis-Numero-100-Bis-75048.html",
    );

    expect(album?.issueNumber).toBe("100bis");
    expect(album?.seriesPosition).toBe(100);
    expect(album?.title).toBe(
      "Super Picsou Géant (Supplément Picsou Magazine) n°100bis",
    );
  });

  it("extrait les entrées titrées d'une fiche série (label + titre complet)", () => {
    const entries = parseBedethequeSeriesAlbumEntries(hsSeriesListingHtml());

    expect(entries).toEqual([
      {
        albumPath:
          "https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-1-Numero-1-478946.html",
        albumId: "478946",
        label: "1",
        title: "Super Picsou Géant -1- Numéro 1",
      },
      {
        albumPath:
          "https://www.bedetheque.com/BD-Super-Picsou-Geant-HS-HDP1-497308.html",
        albumId: "497308",
        label: "HS-HDP1",
        title:
          "Super Picsou Géant -HS-HDP1- L'histoire de la dynastie Picsou Tome 1",
      },
      {
        albumPath:
          "https://www.bedetheque.com/BD-Super-Picsou-Geant-HS-SPM1-468192.html",
        albumId: "468192",
        label: "HS-SPM1",
        title:
          "Super Picsou Géant -HS-SPM1- Picsou - Des souvenirs par millions Tome 1",
      },
    ]);
  });

  it("choisit le bon hors-série par similarité même quand deux HS partagent « Tome 1 »", () => {
    const entries = parseBedethequeSeriesAlbumEntries(hsSeriesListingHtml());

    expect(
      pickBedethequeHorsSerieAlbumPath(
        entries,
        "Super Picsou Géant - Hors-Série - Picsou - Des souvenirs par millions - Tome 1",
      ),
    ).toBe("https://www.bedetheque.com/BD-Super-Picsou-Geant-HS-SPM1-468192.html");

    expect(
      pickBedethequeHorsSerieAlbumPath(
        entries,
        "Super Picsou Géant - Hors-Série - L'histoire de la dynastie Picsou - Tome 1",
      ),
    ).toBe("https://www.bedetheque.com/BD-Super-Picsou-Geant-HS-HDP1-497308.html");
  });

  it("choisit les hors-série codés HS2017 (sans tiret après HS)", () => {
    const entries = parseBedethequeSeriesAlbumEntries(`
      <li>
        <a href="https://www.bedetheque.com/BD-Super-Picsou-Geant-HS-SJ2-Picsou-et-l-enigme-de-l-Atlanduck-451487.html" title="Voir la fiche Album de Super Picsou Géant -HS-SJ2- Picsou et l'enigme de l'Atlanduck">
          <img src="https://www.bedetheque.com/cache/thb_couv/Couv_451487.jpg" alt="Super Picsou Géant -HS-SJ2- Picsou et l'enigme de l'Atlanduck">
        </a>
        <div class="sous-titre"><span class="numa-serie"><b>HS-SJ2</b> - </span> Picsou et l'enigme de l'Atlanduck</div>
      </li>
      <li>
        <a href="https://www.bedetheque.com/BD-Super-Picsou-Geant-HS2017-Tout-Picsou-de-A-a-Z-315785.html" title="Voir la fiche Album de Super Picsou Géant -HS2017- Tout Picsou de A à Z">
          <img src="https://www.bedetheque.com/cache/thb_couv/Couv_315785.jpg" alt="Super Picsou Géant -HS2017- Tout Picsou de A à Z">
        </a>
        <div class="sous-titre"><span class="numa-serie"><b>HS2017</b> - </span> Tout Picsou de A à Z</div>
      </li>
    `);

    expect(
      pickBedethequeHorsSerieAlbumPath(
        entries,
        "Super Picsou Géant - Hors-Série - Tout Picsou de A à Z",
      ),
    ).toBe(
      "https://www.bedetheque.com/BD-Super-Picsou-Geant-HS2017-Tout-Picsou-de-A-a-Z-315785.html",
    );
  });

  it("ne choisit jamais un numéro ordinaire pour une demande hors-série", () => {
    const entries = parseBedethequeSeriesAlbumEntries(hsSeriesListingHtml());
    // Aucun HS ne colle : la Tome-1 ordinaire ne doit pas servir de repli.
    expect(
      pickBedethequeHorsSerieAlbumPath(
        entries,
        "Une toute autre série - Hors-Série - Sujet inconnu",
      ),
    ).toBeNull();
  });

  it("parse la fiche d'un hors-série sans confondre le « Tome 1 » du sous-titre", () => {
    const album = parseBedethequeAlbumPage(
      hsAlbumHtml(),
      "https://www.bedetheque.com/BD-Super-Picsou-Geant-HS-SPM1-468192.html",
    );

    expect(album?.issueNumber).toBe("hs-spm1");
    expect(album?.seriesPosition).toBeUndefined();
    expect(album?.title).toBe(
      "Super Picsou Géant - Picsou - Des souvenirs par millions Tome 1",
    );
  });

  it("garde la série variante en fallback derrière la série principale", () => {
    const ranked = rankBedethequeSeriesCandidates("Super Picsou Géant n°100bis", [
      { id: 11795, label: "Super Picsou Géant" },
      {
        id: 18476,
        label: "Super Picsou Géant (Supplément Picsou Magazine)",
      },
    ]);

    expect(ranked.map((candidate) => candidate.id)).toEqual([11795, 18476]);
  });

  it("écarte une série spinoff quand le tome demandé ne la mentionne pas", () => {
    const picked = pickBedethequeSeriesCandidate("One Piece n°02", [
      { id: 4594, label: "One Piece" },
      { id: 999, label: "One Piece Z" },
    ]);

    expect(picked?.label).toBe("One Piece");
  });

  it("choisit la bonne série quand l'autocomplete en propose plusieurs", () => {
    const picked = pickBedethequeSeriesCandidate("Super Picsou Géant n°7", [
      { id: 11795, label: "Super Picsou Géant" },
      {
        id: 18476,
        label: "Super Picsou Géant (Supplément Picsou Magazine)",
      },
    ]);

    expect(picked?.id).toBe(11795);
  });

  it("accepte un album sans EAN quand un barcode est fourni", () => {
    const album = parseBedethequeAlbumPage(
      albumHtml(),
      "https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-7-Numero-7-56641.html",
    );
    expect(bedethequeAlbumMatchesBarcode(album!, "9782344072578")).toBe(true);
  });

  it("rejette un album dont l'EAN ne correspond pas au barcode attendu", () => {
    const album = parseBedethequeAlbumPage(
      albumHtml({ ean: "9782803604562" }),
      "https://www.bedetheque.com/BD-Asterix-le-Gaulois-1.html",
    );
    expect(bedethequeAlbumMatchesBarcode(album!, "9782344072578")).toBe(false);
    expect(bedethequeAlbumMatchesBarcode(album!, "9782803604562")).toBe(true);
  });

  it("résout Super Picsou n°7 via autocomplete + fiche série + album", async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (url.includes("/ajax/tout")) {
        return {
          status: 200,
          data: [{ id: "S11795", label: "Super Picsou Géant" }],
        };
      }
      if (url.includes("/albums-11795-")) {
        return {
          status: 200,
          data: `<a href="https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-7-Numero-7-56641.html">7</a>`,
        };
      }
      if (url.includes("BD-Super-Picsou-Geant-Tome-7-Numero-7-56641.html")) {
        return { status: 200, data: albumHtml() };
      }
      return { status: 404, data: "" };
    });

    const album = await fetchBedethequeMetadata("Super Picsou Géant n°7");
    expect(album?.id).toBe("56641");
    expect(album?.imageUrl).toContain("Couv_56641.jpg");
  });

  it("résout un numéro bis via la série variante quand la principale ne l'a pas", async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (url.includes("/ajax/tout")) {
        return {
          status: 200,
          data: [
            { id: "S11795", label: "Super Picsou Géant" },
            {
              id: "S18476",
              label: "Super Picsou Géant (Supplément Picsou Magazine)",
            },
          ],
        };
      }
      if (url.includes("/albums-11795-")) {
        return {
          status: 200,
          data: `<a href="https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-100-Numero-100-56800.html">100</a>`,
        };
      }
      if (url.includes("/albums-18476-")) {
        return {
          status: 200,
          data: `<a href="https://www.bedetheque.com/BD-Super-Picsou-Geant-Supplement-Picsou-Magazine-Tome-100Bis-Numero-100-Bis-75048.html">100 Bis</a>`,
        };
      }
      if (url.includes("Tome-100Bis-Numero-100-Bis-75048.html")) {
        return { status: 200, data: bisAlbumHtml() };
      }
      return { status: 404, data: "" };
    });

    const album = await fetchBedethequeMetadata("Super Picsou Géant n°100bis");
    expect(album?.id).toBe("75048");
    expect(album?.issueNumber).toBe("100bis");
    expect(album?.title).toBe(
      "Super Picsou Géant (Supplément Picsou Magazine) n°100bis",
    );
  });

  it("résout un hors-série via la partie série du titre + similarité de sous-titre", async () => {
    mockedGet.mockImplementation(
      async (url: string, config?: { params?: { term?: string } }) => {
        if (url.includes("/ajax/tout")) {
          // Comme en réel : l'autocomplete ne répond qu'au nom de série seul,
          // pas au titre complet contenant « Hors-Série » et le sous-titre.
          const term = String(config?.params?.term ?? "").toLowerCase();
          if (term.includes("hors") || term.includes("souvenirs")) {
            return { status: 200, data: [] };
          }
          return {
            status: 200,
            data: [{ id: "S11795", label: "Super Picsou Géant" }],
          };
        }
        if (url.includes("/albums-11795-")) {
          return { status: 200, data: hsSeriesListingHtml() };
        }
        if (url.includes("BD-Super-Picsou-Geant-HS-SPM1-468192.html")) {
          return { status: 200, data: hsAlbumHtml() };
        }
        return { status: 404, data: "" };
      },
    );

    const album = await fetchBedethequeMetadata(
      "Super Picsou Géant - Hors-Série - Picsou - Des souvenirs par millions - Tome 1",
    );
    expect(album?.id).toBe("468192");
    expect(album?.issueNumber).toBe("hs-spm1");
  });

  it("une demande numérotée ordinaire ne suit jamais un lien hors-série", async () => {
    const fetchedUrls: string[] = [];
    mockedGet.mockImplementation(async (url: string) => {
      fetchedUrls.push(url);
      if (url.includes("/ajax/tout")) {
        return {
          status: 200,
          data: [{ id: "S11795", label: "Super Picsou Géant" }],
        };
      }
      if (url.includes("/albums-11795-")) {
        return { status: 200, data: hsSeriesListingHtml() };
      }
      return { status: 404, data: "" };
    });

    await fetchBedethequeMetadata("Super Picsou Géant n°1");

    expect(
      fetchedUrls.some((url) => url.includes("Tome-1-Numero-1-478946")),
    ).toBe(true);
    expect(fetchedUrls.some((url) => url.includes("-HS-"))).toBe(false);
  });

  it("écarte un hit titre si l'EAN de la fiche contredit le barcode", async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (url.includes("/ajax/tout")) {
        return {
          status: 200,
          data: [{ id: "S11795", label: "Super Picsou Géant" }],
        };
      }
      if (url.includes("/albums-11795-")) {
        return {
          status: 200,
          data: `<a href="https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-7-Numero-7-56641.html">7</a>`,
        };
      }
      if (url.includes("BD-Super-Picsou-Geant-Tome-7-Numero-7-56641.html")) {
        return { status: 200, data: albumHtml({ ean: "9782803604562" }) };
      }
      return { status: 404, data: "" };
    });

    const album = await fetchBedethequeMetadata("Super Picsou Géant n°7", {
      barcode: "9782344072578",
    });
    expect(album).toBeNull();
  });

  it("réutilise ProviderEvidence series SearchYield sans HTTP", async () => {
    const hits = [{ id: 11795, label: "Super Picsou Géant" }];
    readBedethequeSeriesEvidence.mockResolvedValueOnce(hits);

    await expect(searchBedethequeSeries("Super Picsou Géant")).resolves.toEqual(
      hits,
    );
    expect(mockedGet).not.toHaveBeenCalled();
    expect(promoteBedethequeSeriesEvidence).not.toHaveBeenCalled();
  });

  it("promotes series SearchYield after a live ajax GET", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: [{ id: "S11795", label: "Super Picsou Géant" }],
    } as never);

    await expect(searchBedethequeSeries("Super Picsou Géant")).resolves.toEqual([
      { id: 11795, label: "Super Picsou Géant" },
    ]);
    expect(promoteBedethequeSeriesEvidence).toHaveBeenCalledWith(
      expect.stringContaining("/ajax/tout?term="),
      [{ id: 11795, label: "Super Picsou Géant" }],
    );
  });
});

function albumHtml(
  options: {
    ean?: string;
    seriesTitle?: string;
    extraMedia?: string;
    saleRows?: string;
    retailNewPrice?: string;
    priceEstimate?: string;
  } = {},
) {
  const ean = options.ean ?? "";
  const seriesTitle = options.seriesTitle ?? "Super Picsou Géant";
  const extraMedia = options.extraMedia ?? "";
  const saleRows = options.saleRows ?? "";
  const retailNewPrice = options.retailNewPrice ?? "";
  const priceEstimate = options.priceEstimate ?? "de 5 à 10 euros";
  return `
    <title>Super Picsou Géant -7- Numéro 7</title>
    <meta property="og:title" content="Super Picsou Géant -7- Numéro 7" />
    <meta property="og:image" content="https://www.bedetheque.com/media/Couvertures/Couv_56641.jpg" />
    <input type="hidden" id="IdAlbum" value="56641" />
    <input type="hidden" id="EAN" value="${ean}">
    <input type="hidden" id="Couverture" value="https://www.bedetheque.com/media/Couvertures/Couv_56641.jpg">
    <h1><a href="https://www.bedetheque.com/serie-11795-BD-Super-Picsou-Geant.html" title="${seriesTitle}">${seriesTitle}</a></h1>
    <h2>7<span class="numa"></span>. Numéro 7</h2>
    <span itemprop="publisher" class='editeur'>EDI-Monde</span>
    <span class='annee'>1984</span>
    <span itemprop="ratingValue">4.0</span>
    <span itemprop="ratingCount">5</span>
    <meta itemprop="genre" content="Europe - Jeunesse">
    <span itemprop="numberOfPages">192</span> pages
    <p id="p-serie"><span itemprop="description">Histoires Inclues :
1 Picsou et les mousquetaires de l'espace
2 Sir Lock à la chasse au renard
 </span></p>
    <input type="hidden" id="prix_bdfugue" value="${retailNewPrice}">
    <div class='liste-auteurs'>
      <span class='metier'>(Scénario)</span><a href="#" title="Voir la fiche de Barosso, Abramo">Barosso, Abramo</a>
      <span class='metier'>(Dessin)</span><a href="#" title="Voir la fiche de Croci, Patrice">Croci, Patrice</a>
      <span class='metier'>(Couverture)</span><a href="#" title="Voir la fiche de Croci, Patrice">Croci, Patrice</a>
      <span class='metier'>(Couverture)</span><a href="#" title="Voir la fiche de Guillaume, René">Guillaume, René</a>
    </div>
    <ul>
      <li><label>Dépot légal : </label>05/1983</li>
      <li><label>Estimation : </label>${priceEstimate}</li>
      <li><label>Editeur : </label>EDI-Monde</li>
      <li><label>Format : </label>Format normal</li>
      <li><label>Planches :</label>192</li>
      <li><label>Poids :</label>390 g</li>
    </ul>
    ${extraMedia}
    ${saleRows}
  `;
}

function hsSeriesListingHtml() {
  return `
    <li>
      <a href="https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-1-Numero-1-478946.html" title="Voir la fiche Album de Super Picsou Géant -1- Numéro 1">
        <img src="https://www.bedetheque.com/cache/thb_couv/Couv_478946.jpg" alt="Super Picsou Géant -1- Numéro 1">
      </a>
      <div class="sous-titre"><span class="numa-serie"><b>1</b> - </span> Numéro 1</div>
    </li>
    <li>
      <a href="https://www.bedetheque.com/BD-Super-Picsou-Geant-HS-HDP1-497308.html" title="Voir la fiche Album de Super Picsou Géant -HS-HDP1- L&#039;histoire de la dynastie Picsou Tome 1">
        <img src="https://www.bedetheque.com/cache/thb_couv/Couv_497308.jpg" alt="Super Picsou Géant -HS-HDP1- L'histoire de la dynastie Picsou Tome 1">
      </a>
      <div class="sous-titre"><span class="numa-serie"><b>HS-HDP1</b> - </span> L'histoire de la dynastie Picsou Tome 1</div>
    </li>
    <li>
      <a href="https://www.bedetheque.com/BD-Super-Picsou-Geant-HS-SPM1-468192.html" title="Voir la fiche Album de Super Picsou Géant -HS-SPM1- Picsou - Des souvenirs par millions Tome 1">
        <img src="https://www.bedetheque.com/cache/thb_couv/Couv_468192.jpg" alt="Super Picsou Géant -HS-SPM1- Picsou - Des souvenirs par millions Tome 1">
      </a>
      <div class="sous-titre"><span class="numa-serie"><b>HS-SPM1</b> - </span> Picsou - Des souvenirs par millions Tome 1</div>
    </li>
  `;
}

function hsAlbumHtml() {
  return `
    <title>Super Picsou Géant -HS-SPM1- Picsou - Des souvenirs par millions Tome 1</title>
    <meta property="og:title" content="Super Picsou Géant -HS-SPM1- Picsou - Des souvenirs par millions Tome 1" />
    <meta property="og:image" content="https://www.bedetheque.com/media/Couvertures/Couv_468192.jpg" />
    <input type="hidden" id="IdAlbum" value="468192" />
    <h1><a href="https://www.bedetheque.com/serie-11795-BD-Super-Picsou-Geant.html" title="Super Picsou Géant">Super Picsou Géant</a></h1>
    <h2><span class="numa">HS-SPM1</span>. Picsou - Des souvenirs par millions Tome 1</h2>
    <span itemprop="publisher" class='editeur'>Unique Héritage Media</span>
    <span class='annee'>2023</span>
    <ul>
      <li><label>Estimation : </label>non coté</li>
    </ul>
  `;
}

function bisAlbumHtml() {
  return `
    <title>Super Picsou Géant (Supplément Picsou Magazine) -100Bis- Numéro 100 Bis</title>
    <meta property="og:title" content="Super Picsou Géant (Supplément Picsou Magazine) -100Bis- Numéro 100 Bis" />
    <meta property="og:image" content="https://www.bedetheque.com/media/Couvertures/Couv_75048.jpg" />
    <input type="hidden" id="IdAlbum" value="75048" />
    <h1><a href="https://www.bedetheque.com/serie-18476-BD-Super-Picsou-Geant-Supplement-Picsou-Magazine.html" title="Super Picsou Géant (Supplément Picsou Magazine)">Super Picsou Géant (Supplément Picsou Magazine)</a></h1>
    <h2>100<span class="numa">Bis</span>. Numéro 100 Bis</h2>
    <span itemprop="publisher" class='editeur'>EDI-Monde</span>
    <span class='annee'>2000</span>
    <ul>
      <li><label>Estimation : </label>non coté</li>
    </ul>
  `;
}

function modernTomeAlbumHtml() {
  return `
    <title>Super Picsou Géant -178- Picsou Contre Gripsou !</title>
    <meta property="og:title" content="Super Picsou Géant -178- Picsou Contre Gripsou !" />
    <meta property="og:url" content="https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-178-Picsou-Contre-Gripsou-204343.html" />
    <input type="hidden" id="IdAlbum" value="204343" />
    <h1><a href="https://www.bedetheque.com/serie-11795-BD-Super-Picsou-Geant.html" title="Super Picsou Géant">Super Picsou Géant</a></h1>
    <h2>178<span class="numa"></span>. Picsou Contre Gripsou !</h2>
    <a href="https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-1-Numero-1-478946.html">1</a>
    <ul>
      <li><label>Estimation : </label>non coté</li>
    </ul>
  `;
}
