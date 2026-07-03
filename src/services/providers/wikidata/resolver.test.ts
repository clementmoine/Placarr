import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

import axios from "axios";
import { METADATA_OBSERVATION_SCHEMA_VERSION } from "@/lib/metadata/observations";

import {
  createWikidataResolver,
  extractWikidataEntityIds,
  extractWikidataPeople,
  extractWikidataStringClaims,
} from "./resolver";

const mockedGet = vi.mocked(axios.get);

const VIDEO_GAME_QID = "Q7889";
const BOARD_GAME_QID = "Q131436";

// Entité « jeu de société » complète (instance-of Q131436, dates, gens, image).
const CATAN_ENTITY = {
  labels: { fr: { value: "Catan" }, en: { value: "Catan (board game)" } },
  descriptions: { fr: { value: "jeu de société" } },
  sitelinks: { frwiki: { title: "Catan" } },
  claims: {
    P31: [{ mainsnak: { datavalue: { value: { id: BOARD_GAME_QID } } } }],
    P577: [
      { mainsnak: { datavalue: { value: { time: "+1995-00-00T00:00:00Z" } } } },
    ],
    P178: [{ mainsnak: { datavalue: { value: { id: "Q61088" } } } }],
    P123: [{ mainsnak: { datavalue: { value: { id: "Q881194" } } } }],
    P136: [{ mainsnak: { datavalue: { value: { id: "Q131436" } } } }],
    P856: [
      {
        mainsnak: {
          datavalue: { value: "https://www.catan.com/" },
        },
      },
    ],
    P179: [{ mainsnak: { datavalue: { value: { id: "Q1759851" } } } }],
    P18: [{ mainsnak: { datavalue: { value: "Catan.jpg" } } }],
  },
};

const GHOSTBUSTERS_GAME_ENTITY = {
  labels: {
    fr: { value: "SOS Fantômes, le jeu vidéo" },
    en: { value: "Ghostbusters: The Video Game" },
  },
  descriptions: { fr: { value: "jeu vidéo d'action-aventure de 2009" } },
  claims: {
    P31: [{ mainsnak: { datavalue: { value: { id: VIDEO_GAME_QID } } } }],
    P577: [
      { mainsnak: { datavalue: { value: { time: "+2009-06-16T00:00:00Z" } } } },
    ],
  },
};

// Routeur de mock axios déterministe (aucun appel réseau réel).
function routeWikidata(
  entity: unknown,
  search: Array<{ id: string; label: string; description?: string }> = [
    { id: "Q17271", label: "Catan", description: "jeu de société" },
  ],
) {
  return async (url: string, config?: { params?: { action?: string } }) => {
    const action = config?.params?.action;
    if (action === "wbsearchentities") {
      return {
        data: {
          search,
        },
      };
    }
    if (action === "wbgetentities") {
      return {
        data: {
          entities: {
            Q61088: { labels: { fr: { value: "Klaus Teuber" } } },
            Q881194: { labels: { fr: { value: "Kosmos" } } },
            Q131436: { labels: { fr: { value: "jeu de société" } } },
            Q1759851: { labels: { fr: { value: "Catan (série)" } } },
          },
        },
      };
    }
    const entityMatch = url.match(/Special:EntityData\/(Q\d+)\.json/);
    if (entityMatch) {
      return { data: { entities: { [entityMatch[1]]: entity } } };
    }
    if (url.includes("wikipedia.org")) {
      return {
        data: {
          query: {
            pages: {
              "1": {
                extract: "Catan est un jeu de société de Klaus Teuber.",
                thumbnail: { source: "https://upload/catan.jpg" },
              },
            },
          },
        },
      };
    }
    return { data: {} };
  };
}

beforeEach(() => {
  mockedGet.mockReset();
});

describe("extractWikidataEntityIds", () => {
  it("extrait les QID d'une propriété", () => {
    expect(
      extractWikidataEntityIds(
        {
          claims: {
            P123: [{ mainsnak: { datavalue: { value: { id: "Q123" } } } }],
          },
        },
        "P123",
      ),
    ).toEqual(["Q123"]);
  });

  it("ignore les valeurs littérales (string) sans id", () => {
    expect(
      extractWikidataEntityIds(
        {
          claims: { P18: [{ mainsnak: { datavalue: { value: "File.jpg" } } }] },
        },
        "P18",
      ),
    ).toEqual([]);
  });
});

describe("extractWikidataStringClaims", () => {
  it("extrait les URLs littérales d'une propriété", () => {
    expect(
      extractWikidataStringClaims(
        {
          claims: {
            P856: [
              {
                mainsnak: {
                  datavalue: { value: "https://www.catan.com/" },
                },
              },
            ],
          },
        },
        "P856",
      ),
    ).toEqual(["https://www.catan.com/"]);
  });
});

describe("extractWikidataPeople", () => {
  it("résout auteurs et éditeurs depuis les claims Wikidata", async () => {
    mockedGet.mockImplementation(routeWikidata(CATAN_ENTITY) as never);

    const people = await extractWikidataPeople({
      claims: {
        P178: [{ mainsnak: { datavalue: { value: { id: "Q61088" } } } }],
        P123: [{ mainsnak: { datavalue: { value: { id: "Q881194" } } } }],
      },
    });

    expect(people.authors.some((p) => /teuber/i.test(p.name))).toBe(true);
    expect(people.publishers.some((p) => /kosmos/i.test(p.name))).toBe(true);
  });
});

describe("createWikidataResolver", () => {
  it("résout un jeu de société complet (titre, description, date, gens, image)", async () => {
    mockedGet.mockImplementation(routeWikidata(CATAN_ENTITY) as never);

    const res = await createWikidataResolver()("Catan");

    expect(res?.title).toBe("Catan");
    expect(res?.description).toContain("jeu de société");
    expect(res?.releaseDate).toBe("1995-01-01");
    expect(res?.imageUrl).toBe(
      "https://commons.wikimedia.org/wiki/Special:FilePath/Catan.jpg",
    );
    expect(res?.authors?.some((p) => /teuber/i.test(p.name))).toBe(true);
    expect(res?.publishers?.some((p) => /kosmos/i.test(p.name))).toBe(true);
    expect(res?.aliases).toContain("Catan (board game)");
    // P179 "part of the series" → provider-sourced franchise fact.
    expect(res?.facts?.find((f) => f.kind === "franchise")).toMatchObject({
      value: "Catan (série)",
      source: "wikidata",
    });
    expect(res?.facts?.find((f) => f.kind === "genre")).toMatchObject({
      value: "jeu de société",
      source: "wikidata",
    });
    expect(
      res?.facts?.find(
        (f) => f.kind === "external-link" && f.label === "Site officiel",
      ),
    ).toMatchObject({
      url: "https://www.catan.com/",
      source: "wikidata",
    });
    expect(res?.observationSchemaVersion).toBe(
      METADATA_OBSERVATION_SCHEMA_VERSION,
    );
    expect(res?.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "title",
          role: "object_title",
          value: "Catan",
          provenance: expect.objectContaining({
            providerId: "wikidata",
            sourceDocumentRole: "reference_record",
            evidenceSignals: ["structured_data", "external_id"],
          }),
        }),
        expect.objectContaining({
          kind: "image",
          role: "cover_front",
          url: "https://commons.wikimedia.org/wiki/Special:FilePath/Catan.jpg",
        }),
        expect.objectContaining({
          kind: "fact",
          role: "structured_fact",
          factKind: "external-link",
          value: "Q17271",
        }),
        expect.objectContaining({
          kind: "external-id",
          role: "provider_record_id",
          idKind: "wikidata",
          value: "Q17271",
        }),
      ]),
    );
  });

  it("retourne null quand l'entité n'est pas un jeu de société", async () => {
    const notABoardGame = {
      labels: { en: { value: "Some Movie" } },
      descriptions: { en: { value: "a 2008 film" } },
      claims: {
        P31: [{ mainsnak: { datavalue: { value: { id: "Q11424" } } } }],
      },
    };
    mockedGet.mockImplementation(routeWikidata(notABoardGame) as never);

    expect(await createWikidataResolver()("Some Movie")).toBeNull();
  });

  it("résout un jeu vidéo localisé et expose le titre anglais en alias", async () => {
    mockedGet.mockImplementation(
      routeWikidata(GHOSTBUSTERS_GAME_ENTITY, [
        {
          id: "Q1514853",
          label: "Ghostbusters: The Video Game",
          description: "jeu vidéo d'action-aventure",
        },
      ]) as never,
    );

    const res = await createWikidataResolver("games")(
      "SOS Fantômes, le jeu vidéo",
    );

    expect(res?.title).toBe("SOS Fantômes, le jeu vidéo");
    expect(res?.aliases).toContain("Ghostbusters: The Video Game");
    expect(res?.regionalTitles).toEqual(
      expect.arrayContaining([
        { region: "fr", text: "SOS Fantômes, le jeu vidéo" },
        { region: "en", text: "Ghostbusters: The Video Game" },
      ]),
    );
    expect(res?.releaseDate).toBe("2009-01-01");
    expect(res?.externalIds?.wikidata).toBe("Q1514853");
  });

  it("ne laisse pas une entité jeu vidéo matcher le resolver jeu de société", async () => {
    mockedGet.mockImplementation(
      routeWikidata(GHOSTBUSTERS_GAME_ENTITY, [
        {
          id: "Q1514853",
          label: "Ghostbusters: The Video Game",
          description: "jeu vidéo d'action-aventure",
        },
      ]) as never,
    );

    expect(
      await createWikidataResolver("boardgames")("SOS Fantômes, le jeu vidéo"),
    ).toBeNull();
  });

  it("retourne null quand la recherche ne renvoie rien", async () => {
    mockedGet.mockImplementation((async () => ({
      data: { search: [] },
    })) as never);

    expect(await createWikidataResolver()("Inconnu")).toBeNull();
  });
});
