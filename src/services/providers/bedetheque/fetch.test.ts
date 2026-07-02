import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchBedethequeMetadata,
  parseBedethequeAlbumPage,
  parseBedethequeSeriesAlbumLinks,
  pickBedethequeAlbumLink,
  pickBedethequeSeriesCandidate,
  bedethequeAlbumMatchesBarcode,
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
      imageUrl:
        "https://www.bedetheque.com/media/Couvertures/Couv_56641.jpg",
      ratingValue: 4,
      ratingCount: 5,
    });
    expect(album?.title).toBe("Super Picsou Géant n°7");
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
      { issue: "7", albumId: "56641", albumPath: "BD-Super-Picsou-Geant-Tome-7-Numero-7-56641.html" },
      { issue: "2", albumId: "478947", albumPath: "BD-Super-Picsou-Geant-Tome-2-Numero-2-478947.html" },
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
      { issue: "1", albumId: "24065", albumPath: "BD-Naruto-Tome-1-Naruto-Uzumaki-24065.html" },
      { issue: "2", albumId: "24064", albumPath: "BD-Naruto-Tome-2-Un-client-embarrassant-24064.html" },
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
  options: { ean?: string; seriesTitle?: string } = {},
) {
  const ean = options.ean ?? "";
  const seriesTitle = options.seriesTitle ?? "Super Picsou Géant";
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
    <div class='liste-auteurs'>
      <a href="#" title="Voir la fiche de Barosso, Abramo">Barosso, Abramo</a>
    </div>
  `;
}
