import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

import axios from "axios";

import {
  createWikidataResolver,
  extractWikidataEntityIds,
  extractWikidataPeople,
} from "./resolver";

const mockedGet = vi.mocked(axios.get);

const BOARD_GAME_QID = "Q7889";

// Entité « jeu de société » complète (instance-of Q7889, dates, gens, image).
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
    P18: [{ mainsnak: { datavalue: { value: "Catan.jpg" } } }],
  },
};

// Routeur de mock axios déterministe (aucun appel réseau réel).
function routeWikidata(entity: unknown) {
  return async (url: string, config?: { params?: { action?: string } }) => {
    const action = config?.params?.action;
    if (action === "wbsearchentities") {
      return {
        data: {
          search: [
            { id: "Q17271", label: "Catan", description: "jeu de société" },
          ],
        },
      };
    }
    if (action === "wbgetentities") {
      return {
        data: {
          entities: {
            Q61088: { labels: { fr: { value: "Klaus Teuber" } } },
            Q881194: { labels: { fr: { value: "Kosmos" } } },
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

  it("retourne null quand la recherche ne renvoie rien", async () => {
    mockedGet.mockImplementation((async () => ({
      data: { search: [] },
    })) as never);

    expect(await createWikidataResolver()("Inconnu")).toBeNull();
  });
});
