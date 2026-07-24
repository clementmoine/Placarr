import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    isCancel: () => false,
  },
}));

const readSensCritiqueSearchEvidence = vi.fn();
const promoteSensCritiqueSearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  sensCritiqueSearchEvidenceUrl: (input: {
    keywords: string;
    universe?: string;
  }) => {
    const url = new URL("https://www.senscritique.com/search");
    url.searchParams.set("keywords", input.keywords.trim());
    if (input.universe?.trim()) {
      url.searchParams.set("universe", input.universe.trim());
    }
    return url.toString();
  },
  readSensCritiqueSearchEvidence: (...args: unknown[]) =>
    readSensCritiqueSearchEvidence(...args),
  promoteSensCritiqueSearchEvidence: (...args: unknown[]) =>
    promoteSensCritiqueSearchEvidence(...args),
}));

import axios from "axios";

import {
  mapSensCritiqueProductPayload,
  mapSensCritiqueSearchPayload,
  searchSensCritique,
  upgradeSensCritiqueImageUrl,
} from "./fetch";
import {
  mapSensCritiqueMetadata,
  sensCritiqueAliases,
  sensCritiqueUniversesForType,
} from "./resolver";

const mockedGet = vi.mocked(axios.get);

// Captured live from gql.senscritique.com on 2026-07-10 (product id 35074).
const PRODUCT_PAYLOAD = {
  data: {
    product: {
      id: 35074,
      title: "Rayman",
      original_title: null,
      subtitle: null,
      universe: "game",
      url: "/jeuvideo/rayman/35074",
      release_date: "1 septembre 1995",
      year_of_production: 1995,
      duration: null,
      rating: 7.5,
      synopsis:
        "Dans le monde de Rayman, la nature et les habitants vivent en paix.",
      genres: ["Plateforme"],
      artists: null,
      stats: { rating_count: 10594, review_count: 69, wish_count: 671 },
      medias: {
        picture:
          "https://media.senscritique.com/media/000018181917/300/rayman.png",
        backdrop:
          "https://media.senscritique.com/media/000007817244/500/rayman.png",
      },
      allPhotos: {
        posters: [
          {
            url: "https://media.senscritique.com/media/000000102257/0/rayman.jpg",
          },
          {
            url: "https://media.senscritique.com/media/000017191467/0/rayman.jpg",
          },
        ],
        screenshots: null,
        backdrops: [
          {
            url: "https://media.senscritique.com/media/000007817243/0/rayman.png",
          },
        ],
      },
    },
  },
};

const SEARCH_PAYLOAD = {
  data: {
    searchResult: {
      total_count: 32,
      results: [
        {
          universe: "game",
          products_list: [
            {
              id: 415352,
              title: "Rayman Origins",
              original_title: null,
              universe: "game",
              year_of_production: 2011,
              release_date: "24 novembre 2011",
              rating: 7.8,
              url: "/jeuvideo/rayman_origins/415352",
              medias: {
                picture:
                  "https://media.senscritique.com/media/000021010474/300/rayman_origins.png",
              },
            },
            {
              id: 35074,
              title: "Rayman",
              universe: "game",
              year_of_production: 1995,
              rating: 7.5,
              url: "/jeuvideo/rayman/35074",
              medias: { picture: null },
            },
          ],
        },
      ],
    },
  },
};

describe("upgradeSensCritiqueImageUrl", () => {
  it("remplace le segment taille par l'original (/0/)", () => {
    expect(
      upgradeSensCritiqueImageUrl(
        "https://media.senscritique.com/media/000018181917/300/rayman.png",
      ),
    ).toBe("https://media.senscritique.com/media/000018181917/0/rayman.png");
  });

  it("laisse intactes les URLs déjà en /0/ ou hors CDN", () => {
    expect(
      upgradeSensCritiqueImageUrl(
        "https://media.senscritique.com/media/000000102257/0/rayman.jpg",
      ),
    ).toBe("https://media.senscritique.com/media/000000102257/0/rayman.jpg");
    expect(upgradeSensCritiqueImageUrl("https://example.com/a.png")).toBe(
      "https://example.com/a.png",
    );
    expect(upgradeSensCritiqueImageUrl(null)).toBeUndefined();
  });
});

describe("mapSensCritiqueSearchPayload", () => {
  it("aplati les buckets d'univers en hits absolus", () => {
    const hits = mapSensCritiqueSearchPayload(SEARCH_PAYLOAD);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toEqual({
      id: 415352,
      title: "Rayman Origins",
      universe: "game",
      year: 2011,
      rating: 7.8,
      url: "https://www.senscritique.com/jeuvideo/rayman_origins/415352",
      coverUrl:
        "https://media.senscritique.com/media/000021010474/0/rayman_origins.png",
    });
    expect(hits[1].coverUrl).toBeUndefined();
  });

  it("respecte la limite et tolère les payloads vides", () => {
    expect(mapSensCritiqueSearchPayload(SEARCH_PAYLOAD, 1)).toHaveLength(1);
    expect(mapSensCritiqueSearchPayload(null)).toEqual([]);
    expect(mapSensCritiqueSearchPayload({ data: {} })).toEqual([]);
  });
});

describe("mapSensCritiqueProductPayload", () => {
  it("mappe la fiche complète (cover pleine résolution, note, stats)", () => {
    const product = mapSensCritiqueProductPayload(PRODUCT_PAYLOAD);
    expect(product).toMatchObject({
      id: 35074,
      title: "Rayman",
      universe: "game",
      productUrl: "https://www.senscritique.com/jeuvideo/rayman/35074",
      releaseDate: "1 septembre 1995",
      releaseYear: "1995",
      rating: 7.5,
      ratingCount: 10594,
      genres: ["Plateforme"],
      coverUrl:
        "https://media.senscritique.com/media/000018181917/0/rayman.png",
      backdropUrl:
        "https://media.senscritique.com/media/000007817244/0/rayman.png",
    });
    expect(product?.posterUrls).toHaveLength(2);
    expect(product?.screenshotUrls).toBeUndefined();
  });

  it("renvoie null sans id ou titre", () => {
    expect(mapSensCritiqueProductPayload({ data: { product: null } })).toBe(
      null,
    );
    expect(
      mapSensCritiqueProductPayload({
        data: { product: { id: 1, title: "  " } },
      }),
    ).toBe(null);
  });
});

describe("mapSensCritiqueMetadata", () => {
  it("émet facts, attachments typés et observations", () => {
    const product = mapSensCritiqueProductPayload(PRODUCT_PAYLOAD)!;
    const metadata = mapSensCritiqueMetadata(product);

    expect(metadata.title).toBe("Rayman");
    expect(metadata.regionalTitles).toEqual([{ region: "fr", text: "Rayman" }]);
    expect(metadata.facts?.map((fact) => [fact.kind, fact.value])).toEqual([
      ["external-link", "Voir la fiche"],
      ["rating", `7,5/10 (${(10594).toLocaleString("fr-FR")} votes)`],
      ["genre", "Plateforme"],
      ["release-year", "1995"],
    ]);
    expect(metadata.attachments?.map((att) => att.type)).toEqual([
      "cover",
      "cover",
      "cover",
      "background",
    ]);
    expect(metadata.observations?.length).toBeGreaterThan(0);
    expect(metadata.observationSchemaVersion).toBeDefined();
  });

  it("n'hérite pas la plateforme shelf sans signal produit", () => {
    const product = mapSensCritiqueProductPayload(PRODUCT_PAYLOAD)!;
    const metadata = mapSensCritiqueMetadata(product, {
      platform: "atari2600",
      shelfName: "ATARI 2600",
    });
    expect(metadata.platformKey).toBeUndefined();
    expect(metadata.attachments?.every((att) => !att.platformKey)).toBe(true);
  });

  it("expose original_title et subtitle en aliases (jamais le titre)", () => {
    const product = mapSensCritiqueProductPayload({
      data: {
        product: {
          id: 10524696,
          title: "Wizard of Wor",
          original_title: "Le Magicien de Wor",
          subtitle: "Wizard of Wor",
          universe: "game",
          url: "/jeuvideo/wizard_of_wor/10524696",
        },
      },
    })!;
    expect(sensCritiqueAliases(product)).toEqual(["Le Magicien de Wor"]);
    expect(mapSensCritiqueMetadata(product).aliases).toEqual([
      "Le Magicien de Wor",
    ]);
  });
});

describe("searchSensCritique", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    readSensCritiqueSearchEvidence.mockReset();
    promoteSensCritiqueSearchEvidence.mockReset();
    readSensCritiqueSearchEvidence.mockResolvedValue(null);
    promoteSensCritiqueSearchEvidence.mockResolvedValue(undefined);
  });

  it("réutilise ProviderEvidence SearchYield sans HTTP", async () => {
    const hits = [
      {
        id: 415352,
        title: "Rayman Origins",
        universe: "game",
        url: "https://www.senscritique.com/jeuvideo/rayman_origins/415352",
      },
    ];
    readSensCritiqueSearchEvidence.mockResolvedValueOnce(hits);

    await expect(
      searchSensCritique("Rayman", { universe: "game" }),
    ).resolves.toEqual(hits);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(promoteSensCritiqueSearchEvidence).not.toHaveBeenCalled();
  });

  it("promotes SearchYield after a live GraphQL search", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: SEARCH_PAYLOAD,
    } as never);

    const hits = await searchSensCritique("Rayman", { universe: "game" });
    expect(hits[0]?.id).toBe(415352);
    expect(promoteSensCritiqueSearchEvidence).toHaveBeenCalledWith(
      "https://www.senscritique.com/search?keywords=Rayman&universe=game",
      expect.arrayContaining([
        expect.objectContaining({ id: 415352 }),
      ]),
    );
  });
});

describe("sensCritiqueUniversesForType", () => {
  it("mappe les types Placarr vers les univers SC", () => {
    expect(sensCritiqueUniversesForType("games")).toEqual(["game"]);
    expect(sensCritiqueUniversesForType("books")).toEqual([
      "book",
      "comicBook",
    ]);
    expect(sensCritiqueUniversesForType("movies")).toEqual([
      "movie",
      "tvShow",
    ]);
    expect(sensCritiqueUniversesForType("musics")).toEqual(["musicAlbum"]);
    expect(sensCritiqueUniversesForType("boardgames")).toEqual([]);
    expect(sensCritiqueUniversesForType(null)).toEqual([]);
    expect(sensCritiqueUniversesForType("unknown")).toEqual([]);
  });
});
