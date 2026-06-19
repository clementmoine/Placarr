import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  games: vi.fn(),
  movies: vi.fn(),
  musics: vi.fn(),
  books: vi.fn(),
  boardgames: vi.fn(),
  registry: vi.fn(),
}));

vi.mock("@/services/metadataGameFetch", () => ({
  fetchFromAllGameSources: h.games,
}));
vi.mock("@/services/metadataMovieFetch", () => ({
  fetchFromAllMovieSources: h.movies,
}));
vi.mock("@/services/metadataMusicFetch", () => ({
  fetchFromAllMusicSources: h.musics,
}));
vi.mock("@/services/metadataBookFetch", () => ({
  fetchFromAllBookSources: h.books,
}));
vi.mock("@/services/metadataBoardGameFetch", () => ({
  fetchFromAllBoardGameSources: h.boardgames,
}));
vi.mock("@/services/metadataProviderSelection", () => ({
  fetchFromRegistryMetadataResolvers: h.registry,
}));

import { fetchMetadataByType } from "./metadataFetch";

const CASES: Array<{ type: string; fn: ReturnType<typeof vi.fn> }> = [
  { type: "games", fn: h.games },
  { type: "movies", fn: h.movies },
  { type: "musics", fn: h.musics },
  { type: "books", fn: h.books },
  { type: "boardgames", fn: h.boardgames },
];

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset();
});

describe("fetchMetadataByType — routage par type", () => {
  it.each(CASES)(
    "route le type « $type » vers le bon fetcher et propage les arguments",
    async ({ type, fn }) => {
      fn.mockResolvedValue({ title: `${type} result` });

      const res = await fetchMetadataByType("Catan", type, "123", "wii");

      expect(fn).toHaveBeenCalledWith("Catan", "123", "wii");
      expect(res).toEqual({ title: `${type} result` });

      // Aucun autre fetcher n'est sollicité.
      for (const other of CASES) {
        if (other.fn !== fn) expect(other.fn).not.toHaveBeenCalled();
      }
      expect(h.registry).not.toHaveBeenCalled();
    },
  );

  it("retombe sur le registre pour un type inconnu", async () => {
    h.registry.mockResolvedValue(null);

    const res = await fetchMetadataByType("X", "comics", null, null);

    expect(h.registry).toHaveBeenCalledWith("X", "comics", null, null);
    expect(res).toBeNull();
    for (const c of CASES) expect(c.fn).not.toHaveBeenCalled();
  });
});
