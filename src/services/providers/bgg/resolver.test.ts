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
                      content: "https://cf.geekdo-images.com/catan.jpg",
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
                              { usersrated: { value: "1000" } },
                            ],
                          },
                        },
                      ],
                    },
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
    expect(res?.imageUrl).toContain("catan.jpg");
    expect(res?.authors).toEqual([{ name: "Klaus Teuber" }]);
    expect(res?.publishers).toEqual([{ name: "Kosmos" }]);
    expect(res?.aliases).toContain("Les Colons de Catane");
    expect(res?.facts?.some((f) => f.kind === "players")).toBe(true);
    expect(
      res?.facts?.some((f) => f.kind === "age-rating" && f.value === "10+"),
    ).toBe(true);
    expect(res?.facts?.some((f) => f.kind === "rating")).toBe(true);
  });

  it("retourne null quand la recherche ne renvoie aucun résultat", async () => {
    process.env.BGG_API_TOKEN = "test-token";
    mockedGet.mockResolvedValue({ data: "<xml/>" } as never);
    mockedConvert.mockReturnValueOnce({ items: { children: [] } } as never);

    const fetchFromBGG = createBGGResolver({ formatScore });

    expect(await fetchFromBGG("Inconnu")).toBeNull();
  });
});
