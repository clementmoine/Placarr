import { describe, expect, it, vi, beforeEach } from "vitest";

const { tmdbResolve, omdbResolve } = vi.hoisted(() => ({
  tmdbResolve: vi.fn(),
  omdbResolve: vi.fn(),
}));

vi.mock("@/services/metadataResolvers", () => ({
  metadataProviderResolverMap: new Map([
    ["tmdb", { id: "tmdb", resolve: tmdbResolve }],
    ["omdb", { id: "omdb", resolve: omdbResolve }],
  ]),
}));

import { fetchFromAllMovieSources } from "@/services/metadataMovieFetch";

describe("fetchFromAllMovieSources", () => {
  beforeEach(() => {
    tmdbResolve.mockReset();
    omdbResolve.mockReset();
  });

  it("passe l'imdb TMDB à OMDb pour enrichir les notes", async () => {
    tmdbResolve.mockResolvedValue({
      title: "Pocahontas",
      externalIds: { imdb: "tt0114148" },
      facts: [
        { kind: "rating", label: "TMDB", value: "6,9/10", source: "tmdb" },
      ],
    });
    omdbResolve.mockResolvedValue({
      title: "Pocahontas",
      facts: [
        {
          kind: "rating",
          label: "Internet Movie Database",
          value: "6.7/10",
          source: "omdb",
        },
        {
          kind: "rating",
          label: "Metascore",
          value: "59/100",
          source: "omdb",
        },
      ],
    });

    const res = await fetchFromAllMovieSources(
      "Pocahontas: Une légende indienne",
      null,
    );

    expect(omdbResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        imdbId: "tt0114148",
        fallbackNames: expect.arrayContaining([
          "Pocahontas",
          "Pocahontas: Une légende indienne",
        ]),
      }),
    );
    expect(
      res?.facts?.filter((fact) => fact.kind === "rating").length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("fusionne TMDB et OMDb avec fieldEvidence", async () => {
    tmdbResolve.mockResolvedValue({
      title: "Inception",
      description: "Un voleur qui s'infiltre dans les rêves.",
      facts: [{ kind: "rating", label: "TMDB", value: "8.4", source: "tmdb" }],
    });
    omdbResolve.mockResolvedValue({
      title: "Inception",
      facts: [{ kind: "rating", label: "IMDb", value: "8.8", source: "omdb" }],
    });

    const res = await fetchFromAllMovieSources("Inception", null);

    expect(res?.title).toBe("Inception");
    expect(res?.fieldEvidence?.some((e) => e.source === "TMDB")).toBe(true);
    expect(res?.fieldEvidence?.some((e) => e.source === "OMDb")).toBe(true);
    expect(res?.facts?.length).toBeGreaterThanOrEqual(2);
  });

  it("retourne null si aucune source ne répond", async () => {
    tmdbResolve.mockResolvedValue(null);
    omdbResolve.mockResolvedValue(null);

    expect(await fetchFromAllMovieSources("Inconnu", null)).toBeNull();
  });

  it("fonctionne avec une seule source (OMDb seul)", async () => {
    tmdbResolve.mockResolvedValue(null);
    omdbResolve.mockResolvedValue({ title: "Solo Movie" });

    const res = await fetchFromAllMovieSources("Solo Movie", null);

    expect(res?.title).toBe("Solo Movie");
    expect(res?.fieldEvidence?.some((e) => e.source === "OMDb")).toBe(true);
  });
});
