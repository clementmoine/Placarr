import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
vi.mock("simple-xml-to-json", () => ({ convertXML: vi.fn() }));

import axios from "axios";
import { convertXML } from "simple-xml-to-json";

import { createBGGResolver } from "./resolver";

const mockedGet = vi.mocked(axios.get);
const mockedConvert = vi.mocked(convertXML);

const formatScore = (value: number) =>
  Number.isFinite(value) ? value.toFixed(1) : null;

const SAVED_TOKEN = process.env.BGG_API_TOKEN;

afterEach(() => {
  if (SAVED_TOKEN !== undefined) process.env.BGG_API_TOKEN = SAVED_TOKEN;
  else delete process.env.BGG_API_TOKEN;
  vi.clearAllMocks();
});

describe("createBGGResolver", () => {
  it("retourne null quand BGG_API_TOKEN est absent (source désactivée)", async () => {
    delete process.env.BGG_API_TOKEN;

    const fetchFromBGG = createBGGResolver({ formatScore });

    expect(await fetchFromBGG("Catan")).toBeNull();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("mappe la fiche BGG (titre, joueurs, âge, note, auteurs, alias)", async () => {
    process.env.BGG_API_TOKEN = "test-token";
    mockedGet.mockResolvedValue({ data: "<xml/>" } as never);
    mockedConvert
      .mockReturnValueOnce({
        items: {
          children: [
            {
              item: {
                id: "13",
                children: [{ name: { type: "primary", value: "Catan" } }],
              },
            },
          ],
        },
      } as never)
      .mockReturnValueOnce({
        items: {
          children: [
            {
              item: {
                id: "13",
                children: [
                  { name: { type: "primary", value: "Catan" } },
                  {
                    name: { type: "alternate", value: "Les Colons de Catane" },
                  },
                  { description: { content: "Construisez des colonies." } },
                  { yearpublished: { value: "1995" } },
                  { minplayers: { value: "3" } },
                  { maxplayers: { value: "4" } },
                  { playingtime: { value: "60" } },
                  { minage: { value: "10" } },
                  {
                    image: {
                      content: "https://cf.geekdo-images.com/catan-main.jpg",
                    },
                  },
                  {
                    versions: {
                      children: [
                        {
                          item: {
                            children: [
                              {
                                image: {
                                  content:
                                    "https://cf.geekdo-images.com/catan-fr.jpg",
                                },
                              },
                              {
                                name: {
                                  type: "primary",
                                  value: "French edition",
                                },
                              },
                              {
                                link: { type: "language", value: "French" },
                              },
                            ],
                          },
                        },
                        {
                          item: {
                            children: [
                              {
                                image: {
                                  content:
                                    "https://cf.geekdo-images.com/catan-en.jpg",
                                },
                              },
                              {
                                name: {
                                  type: "primary",
                                  value: "English edition",
                                },
                              },
                              {
                                link: { type: "language", value: "English" },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                  {
                    link: { type: "boardgamedesigner", value: "Klaus Teuber" },
                  },
                  { link: { type: "boardgamepublisher", value: "Kosmos" } },
                  {
                    statistics: {
                      children: [
                        {
                          ratings: {
                            children: [
                              { average: { value: "7.2" } },
                              { bayesaverage: { value: "7.4" } },
                              { usersrated: { value: "1000" } },
                              {
                                ranks: {
                                  children: [
                                    {
                                      rank: {
                                        name: "boardgame",
                                        value: "342",
                                      },
                                    },
                                  ],
                                },
                              },
                              { averageweight: { value: "2.3" } },
                            ],
                          },
                        },
                      ],
                    },
                  },
                  {
                    "poll-summary": {
                      name: "suggested_numplayers",
                      children: [
                        {
                          result: {
                            name: "bestwith",
                            value: "Best with 3–4 players",
                          },
                        },
                      ],
                    },
                  },
                  {
                    link: { type: "boardgameartist", value: "Michael Menzel" },
                  },
                ],
              },
            },
          ],
        },
      } as never);

    const fetchFromBGG = createBGGResolver({ formatScore });
    const res = await fetchFromBGG("Catan");

    expect(res?.title).toBe("Catan");
    expect(res?.releaseDate).toBe("1995");
    expect(res?.imageUrl).toContain("catan-fr.jpg");
    expect(res?.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "cover",
          role: "fr",
          url: "https://cf.geekdo-images.com/catan-fr.jpg",
          source: "bgg",
        }),
        expect.objectContaining({
          type: "cover",
          role: "wor",
          url: "https://cf.geekdo-images.com/catan-en.jpg",
        }),
        expect.objectContaining({
          type: "cover",
          role: "wor",
          url: "https://cf.geekdo-images.com/catan-main.jpg",
        }),
      ]),
    );
    expect(res?.authors).toEqual([{ name: "Klaus Teuber" }]);
    expect(res?.publishers).toEqual([{ name: "Kosmos" }]);
    expect(res?.aliases).toContain("Les Colons de Catane");
    expect(res?.facts?.some((f) => f.kind === "players")).toBe(true);
    expect(
      res?.facts?.some((f) => f.kind === "age-rating" && f.value === "10+"),
    ).toBe(true);
    const ratingFacts = res?.facts?.filter((f) => f.kind === "rating") || [];
    expect(ratingFacts).toHaveLength(1);
    expect(ratingFacts[0]).toMatchObject({
      label: "BoardGameGeek",
      value: "7.4 (1 000 votes)",
    });
    expect(
      res?.facts?.some((f) => f.kind === "popularity" && f.value === "#342"),
    ).toBe(true);
    expect(
      res?.facts?.some((f) => f.kind === "complexity" && f.value === "2,3 / 5"),
    ).toBe(true);
    expect(
      res?.facts?.some(
        (f) =>
          f.kind === "recommended-players" &&
          f.value.includes("Best with 3–4 players"),
      ),
    ).toBe(true);
    expect(
      res?.facts?.some(
        (f) => f.kind === "artist" && f.value === "Michael Menzel",
      ),
    ).toBe(true);
  });

  it("ignore un minage BGG à 0", async () => {
    process.env.BGG_API_TOKEN = "test-token";
    mockedGet.mockResolvedValue({ data: "<xml/>" } as never);
    mockedConvert
      .mockReturnValueOnce({
        items: {
          children: [
            {
              item: {
                id: "13",
                children: [{ name: { type: "primary", value: "Catan" } }],
              },
            },
          ],
        },
      } as never)
      .mockReturnValueOnce({
        items: {
          children: [
            {
              item: {
                id: "13",
                children: [
                  { name: { type: "primary", value: "Catan" } },
                  { minage: { value: "0" } },
                ],
              },
            },
          ],
        },
      } as never);

    const fetchFromBGG = createBGGResolver({ formatScore });
    const res = await fetchFromBGG("Catan");

    expect(res?.facts?.some((f) => f.kind === "age-rating")).toBe(false);
  });

  it("retourne null quand la recherche ne renvoie aucun résultat", async () => {
    process.env.BGG_API_TOKEN = "test-token";
    mockedGet.mockResolvedValue({ data: "<xml/>" } as never);
    mockedConvert.mockReturnValueOnce({ items: { children: [] } } as never);

    const fetchFromBGG = createBGGResolver({ formatScore });

    expect(await fetchFromBGG("Inconnu")).toBeNull();
  });
});
