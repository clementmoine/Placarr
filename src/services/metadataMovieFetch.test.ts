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
