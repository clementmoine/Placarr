import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

import { supplementBookSearchAliases } from "./bookSearchAliases";

const mockedGet = vi.mocked(axios.get);

describe("supplementBookSearchAliases", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("ajoute les titres anglais/romaji d'une même série manga via Open Library", async () => {
    mockedGet.mockResolvedValue({
      data: {
        docs: [
          { title: "Attack On Titan, Vol. 2" },
          { title: "Attack on Titan" },
          { title: "Attack On Titan, Vol. 1" },
          { title: "Shingeki no kyojin" },
          { title: "Shingeki no kyojin" },
          { title: "Attack on Titan Junior high" },
        ],
      },
    });

    const aliases = await supplementBookSearchAliases("Attaque des Titans n°02", [
      { name: "Hajime Isayama" },
    ]);

    expect(aliases).toEqual(
      expect.arrayContaining([
        "Attack On Titan, Vol. 2",
        "Attack on Titan",
        "Shingeki no kyojin",
      ]),
    );
  });

  it("retourne une liste vide sans auteur latin", async () => {
    await expect(
      supplementBookSearchAliases("Attaque des Titans n°02", [
        { name: "諫山創" },
      ]),
    ).resolves.toEqual([]);
    expect(mockedGet).not.toHaveBeenCalled();
  });
});
