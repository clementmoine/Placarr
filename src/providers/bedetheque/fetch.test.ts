import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchBedethequeMetadata,
  parseBedethequeAlbumInfoFields,
  parseBedethequeAlbumPage,
  parseBedethequeCreditedRoles,
  parseBedethequeMediaUrls,
  parseBedethequeSaleListings,
  parseBedethequeRetailPrices,
  parseBedethequeSeriesAlbumLinks,
  pickBedethequeAlbumLink,
  pickBedethequeSeriesCandidate,
  bedethequeAlbumMatchesBarcode,
  isKnownBedethequePriceEstimate,
} from "./fetch";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockedGet = vi.mocked(axios.get);

describe("bedetheque fetch", () => {
  beforeEach(() => {
    mockedGet.mockReset();
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
