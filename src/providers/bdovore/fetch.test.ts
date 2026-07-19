import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  composeBdovoreTitle,
  effectiveBdovoreSeriesLabel,
  fetchBdovoreMetadata,
  mapBdovoreAlbumRecord,
  pickBdovoreAlbum,
  rankBdovoreSeriesCandidates,
} from "./fetch";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockedGet = vi.mocked(axios.get);

function bisAlbumRecord() {
  return {
    ID_TOME: "46376",
    TITRE_TOME: "Super Picsou Géant, Tome 100 bis",
    NUM_TOME: "100",
    PRIX_BDNET: null,
    HISTOIRE_TOME: "Sommaire:\r\n-1 Donald contre Fantomiald !",
    NB_NOTE_TOME: "1",
    MOYENNE_NOTE_TOME: "5.00",
    ID_SERIE: "12308",
    NOM_SERIE: "Super Picsou Géant bis",
    NOM_GENRE: "Jeunesse",
    IMG_COUV: "CV-046376-045734.jpg",
    EAN_EDITION: null,
    ISBN_EDITION: null,
    DTE_PARUTION: "1980-06-01",
    NOM_COLLECTION: "Presse Junior",
    NOM_EDITEUR: "Disney Hachette",
    NOM_EDITION: "Disney Hachette 1980",
    scpseudo: "Collectif",
    depseudo: "Collectif",
    copseudo: "Indéterminé",
    scapseudo: "Aucun",
    deapseudo: "Aucun",
    coapseudo: "Aucun",
  };
}

function modernAlbumRecord() {
  return {
    ID_TOME: "72387",
    TITRE_TOME: "Fucking patriot",
    NUM_TOME: "11",
    PRIX_BDNET: "10.40",
    NOM_SERIE: "Alpha",
    ID_SERIE: "59",
    EAN_EDITION: "9782803624560",
    DTE_PARUTION: "2015-01-09",
    scpseudo: "Jigounov, Iouri",
  };
}

describe("bdovore fetch", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("mappe un record d'album (crédits placeholders filtrés, cover, date)", () => {
    const album = mapBdovoreAlbumRecord(bisAlbumRecord());

    expect(album).toMatchObject({
      id: "46376",
      title: "Super Picsou Géant, Tome 100 bis",
      issueNumber: "100bis",
      seriesName: "Super Picsou Géant bis",
      editionName: "Disney Hachette 1980",
      publisher: "Disney Hachette",
      collection: "Presse Junior",
      releaseDate: "1980-06-01",
      genre: "Jeunesse",
      ratingValue: 5,
      ratingCount: 1,
      imageUrl: "https://www.bdovore.com/images/couv/CV-046376-045734.jpg",
      sourceUrl: "https://www.bdovore.com/Album?id_tome=46376",
    });
    // "Indéterminé"/"Aucun" ne sont pas des crédits ; "Collectif" oui.
    expect(album?.credits).toEqual([
      { role: "Scénario", names: ["Collectif"] },
      { role: "Dessin", names: ["Collectif"] },
    ]);
  });

  it("compose le titre des albums nus (série + tome), pas des périodiques", () => {
    expect(composeBdovoreTitle("Fucking patriot", "Alpha", "11")).toBe(
      "Alpha - Tome 11 - Fucking patriot",
    );
    expect(
      composeBdovoreTitle(
        "Super Picsou Géant, Tome 7",
        "Super Picsou Géant",
        "7",
      ),
    ).toBe("Super Picsou Géant, Tome 7");
    // Le titre porte déjà son numéro : la série est préfixée sans re-numéroter.
    expect(
      composeBdovoreTitle(
        "Picsou, des souvenirs par millions, Tome 1",
        "Super Picsou géant hors série",
        "1",
      ),
    ).toBe(
      "Super Picsou géant hors série - Picsou, des souvenirs par millions, Tome 1",
    );
  });

  it("extrait la sous-série du qualificatif hors-série pour composer un titre alignable", () => {
    expect(
      effectiveBdovoreSeriesLabel(
        "Picsou Magazine (hors-série, les trésors de Picsou)",
      ),
    ).toBe("Les trésors de Picsou");
    // Pas de parenthèse hors-série → nom de série inchangé.
    expect(effectiveBdovoreSeriesLabel("Super Picsou Géant bis")).toBe(
      "Super Picsou Géant bis",
    );

    // Sous-titre auto-identifiant : la sous-série est déjà couverte → titre nu.
    expect(
      composeBdovoreTitle(
        "Les trésors de Picsou n°47",
        "Picsou Magazine (hors-série, les trésors de Picsou)",
        "47",
      ),
    ).toBe("Les trésors de Picsou n°47");
    // Sous-titre nu : préfixe la SOUS-série, pas le nom complet bruité.
    expect(
      composeBdovoreTitle(
        "11 histoires cultes !",
        "Picsou Magazine (hors-série, les trésors de Picsou)",
        "45",
      ),
    ).toBe("Les trésors de Picsou - Tome 45 - 11 histoires cultes !");
  });

  it("exige l'égalité stricte du numéro (100bis ≠ 100)", () => {
    const albums = [
      mapBdovoreAlbumRecord({
        ...bisAlbumRecord(),
        ID_TOME: "1",
        TITRE_TOME: "Super Picsou Géant, Tome 100",
        NOM_SERIE: "Super Picsou Géant",
      })!,
      mapBdovoreAlbumRecord(bisAlbumRecord())!,
    ];

    expect(pickBdovoreAlbum(albums, "Super Picsou Géant n°100bis")?.id).toBe(
      "46376",
    );
    expect(pickBdovoreAlbum(albums, "Super Picsou Géant n°100")?.id).toBe("1");
    expect(pickBdovoreAlbum(albums, "Super Picsou Géant n°101")).toBeNull();
  });

  it("cloisonne hors-série et numéros ordinaires dans les deux sens", () => {
    const regular = mapBdovoreAlbumRecord({
      ...bisAlbumRecord(),
      ID_TOME: "10",
      TITRE_TOME: "Super Picsou Géant, Tome 1",
      NOM_SERIE: "Super Picsou Géant",
    })!;
    const horsSerie = mapBdovoreAlbumRecord({
      ...bisAlbumRecord(),
      ID_TOME: "362444",
      TITRE_TOME: "Picsou, des souvenirs par millions, Tome 1",
      NOM_SERIE: "Super Picsou géant hors série",
    })!;

    expect(
      pickBdovoreAlbum(
        [regular, horsSerie],
        "Super Picsou Géant - Hors-Série - Picsou - Des souvenirs par millions - Tome 1",
      )?.id,
    ).toBe("362444");
    expect(
      pickBdovoreAlbum([regular, horsSerie], "Super Picsou Géant n°1")?.id,
    ).toBe("10");
  });

  it("résout un hors-série de la série principale sans marqueur dans le titre", () => {
    const regular = mapBdovoreAlbumRecord({
      ...bisAlbumRecord(),
      ID_TOME: "317748",
      TITRE_TOME: "La bande à Picsou",
      NUM_TOME: "1",
      NOM_SERIE: "Super Picsou géant hors série",
    })!;
    const toutPicsou = mapBdovoreAlbumRecord({
      ...bisAlbumRecord(),
      ID_TOME: "262828",
      TITRE_TOME: "Picsou tout picsou de A à Z",
      NUM_TOME: null,
      NOM_SERIE: "Super Picsou Géant",
      DTE_PARUTION: "2017-10-30",
    })!;

    expect(
      pickBdovoreAlbum(
        [regular, toutPicsou],
        "Super Picsou Géant - Hors-Série - Tout Picsou de A à Z",
      )?.id,
    ).toBe("262828");
  });

  it("classe les séries candidates par similarité avec seuil", () => {
    const ranked = rankBdovoreSeriesCandidates("Super Picsou Géant n°100bis", [
      { id: "12157", label: "Super Conan Special (Petit format)" },
      { id: "12308", label: "Super Picsou Géant bis" },
      { id: "12269", label: "Super Picsou Géant" },
    ]);

    expect(ranked[0]?.id).toBe("12269");
    expect(ranked.map((c) => c.id)).toContain("12308");
    expect(ranked.map((c) => c.id)).not.toContain("12157");
  });

  it("préfère une série dont le libellé embarque tous les tokens distinctifs de la requête", () => {
    const ranked = rankBdovoreSeriesCandidates("Les Trésors de Picsou n°1", [
      { id: "846", label: "Les âges d'or de Picsou" },
      {
        id: "12539",
        label: "Picsou Magazine (hors-série, les trésors de Picsou)",
      },
    ]);

    expect(ranked[0]?.id).toBe("12539");
    expect(ranked[0]?.id).not.toBe("846");
  });

  it("sélectionne un album hors-série quand le libellé de série embarque la requête", () => {
    const album = mapBdovoreAlbumRecord({
      ...bisAlbumRecord(),
      ID_TOME: "47485",
      TITRE_TOME: "Les trésors de Picsou n°1 : La jeunesse de Picsou",
      NUM_TOME: "1",
      NOM_SERIE: "Picsou Magazine (hors-série, les trésors de Picsou)",
      ID_SERIE: "12539",
    })!;

    expect(pickBdovoreAlbum([album], "Les Trésors de Picsou n°1")?.id).toBe(
      "47485",
    );
  });

  it("ne résout pas un hors-série embarqué vers une autre ligne de la franchise", async () => {
    mockedGet.mockImplementation(
      async (_url: string, config?: { params?: Record<string, string> }) => {
        const params = config?.params ?? {};
        if (params.data === "Serie") {
          return {
            status: 200,
            data: JSON.stringify([
              { ID_SERIE: "846", NOM_SERIE: "Les âges d'or de Picsou" },
              {
                ID_SERIE: "12539",
                NOM_SERIE: "Picsou Magazine (hors-série, les trésors de Picsou)",
              },
            ]),
          };
        }
        if (params.id_serie === "12539") {
          return {
            status: 200,
            data: JSON.stringify([
              {
                ...bisAlbumRecord(),
                ID_TOME: "47485",
                TITRE_TOME: "Les trésors de Picsou n°1 : La jeunesse de Picsou",
                NUM_TOME: "1",
                NOM_SERIE: "Picsou Magazine (hors-série, les trésors de Picsou)",
                ID_SERIE: "12539",
              },
            ]),
          };
        }
        if (params.id_serie === "846") {
          return {
            status: 200,
            data: JSON.stringify([
              {
                ...bisAlbumRecord(),
                ID_TOME: "397505",
                TITRE_TOME: "Les âges d'or de Picsou, Tome 1",
                NUM_TOME: "1",
                NOM_SERIE: "Les âges d'or de Picsou",
                ID_SERIE: "846",
              },
            ]),
          };
        }
        return { status: 200, data: "[]" };
      },
    );

    const album = await fetchBdovoreMetadata("Les Trésors de Picsou n°1");
    expect(album?.id).toBe("47485");
    expect(album?.id).not.toBe("397505");
  });

  it("résout un EAN directement via l'API (data=Album&EAN=)", async () => {
    mockedGet.mockImplementation(
      async (_url: string, config?: { params?: Record<string, string> }) => {
        if (config?.params?.EAN === "9782803624560") {
          return { status: 200, data: JSON.stringify([modernAlbumRecord()]) };
        }
        return { status: 200, data: "[]" };
      },
    );

    const album = await fetchBdovoreMetadata("", {
      barcode: "9782803624560",
    });
    expect(album?.id).toBe("72387");
    expect(album?.title).toBe("Alpha - Tome 11 - Fucking patriot");
    expect(album?.priceNewCents).toBe(1040);
  });

  it("résout un numéro bis via la série sœur « <série> bis »", async () => {
    mockedGet.mockImplementation(
      async (_url: string, config?: { params?: Record<string, string> }) => {
        const params = config?.params ?? {};
        if (params.data === "Serie") {
          const term = String(params.term || "");
          if (/\bbis\b/i.test(term)) {
            return {
              status: 200,
              data: JSON.stringify([
                { ID_SERIE: "12308", NOM_SERIE: "Super Picsou Géant bis" },
                { ID_SERIE: "12269", NOM_SERIE: "Super Picsou Géant" },
              ]),
            };
          }
          return {
            status: 200,
            data: JSON.stringify([
              { ID_SERIE: "12269", NOM_SERIE: "Super Picsou Géant" },
            ]),
          };
        }
        if (params.id_serie === "12308") {
          return { status: 200, data: JSON.stringify([bisAlbumRecord()]) };
        }
        if (params.id_serie === "12269") {
          return {
            status: 200,
            data: JSON.stringify([
              {
                ...bisAlbumRecord(),
                ID_TOME: "46095",
                TITRE_TOME: "Super Picsou Géant, Tome 100",
                NOM_SERIE: "Super Picsou Géant",
              },
            ]),
          };
        }
        return { status: 200, data: "[]" };
      },
    );

    const album = await fetchBdovoreMetadata("Super Picsou Géant n°100bis");
    expect(album?.id).toBe("46376");
    expect(album?.issueNumber).toBe("100bis");
  });

  it("résout Tout Picsou de A à Z dans la série principale avant la sous-série HS", async () => {
    mockedGet.mockImplementation(
      async (_url: string, config?: { params?: Record<string, string> }) => {
        const params = config?.params ?? {};
        if (params.data === "Serie") {
          const term = String(params.term || "").toLowerCase();
          if (term.includes("hors serie")) {
            return {
              status: 200,
              data: JSON.stringify([
                {
                  ID_SERIE: "45358",
                  NOM_SERIE: "Super Picsou géant hors série",
                },
              ]),
            };
          }
          return {
            status: 200,
            data: JSON.stringify([
              { ID_SERIE: "12269", NOM_SERIE: "Super Picsou Géant" },
            ]),
          };
        }
        if (params.id_serie === "12269") {
          return {
            status: 200,
            data: JSON.stringify([
              {
                ...bisAlbumRecord(),
                ID_TOME: "262828",
                TITRE_TOME: "Picsou tout picsou de A à Z",
                NUM_TOME: null,
                NOM_SERIE: "Super Picsou Géant",
                DTE_PARUTION: "2017-10-30",
              },
            ]),
          };
        }
        if (params.id_serie === "45358") {
          return {
            status: 200,
            data: JSON.stringify([
              {
                ...bisAlbumRecord(),
                ID_TOME: "317748",
                TITRE_TOME: "La bande à Picsou",
                NUM_TOME: "1",
                NOM_SERIE: "Super Picsou géant hors série",
              },
            ]),
          };
        }
        return { status: 200, data: "[]" };
      },
    );

    const album = await fetchBdovoreMetadata(
      "Super Picsou Géant - Hors-Série - Tout Picsou de A à Z",
    );
    expect(album?.id).toBe("262828");
    expect(album?.releaseDate).toBe("2017-10-30");
  });

  it("maps IMG_COUV to the public couv URL (no HD variant)", () => {
    const album = mapBdovoreAlbumRecord({
      ...bisAlbumRecord(),
      ID_TOME: "51068",
      IMG_COUV: "CV-051068-050605.jpg",
    });
    expect(album?.imageUrl).toBe(
      "https://www.bdovore.com/images/couv/CV-051068-050605.jpg",
    );
    expect(album?.sourceUrl).toContain("id_tome=51068");
  });
});
