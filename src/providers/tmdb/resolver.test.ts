import { describe, expect, it } from "vitest";

import { parseTMDBSeriesIntent, tmdbImageRole } from "./resolver";

describe("tmdbImageRole — langue de l'affiche → région", () => {
  it("mappe la langue de l'affiche vers une région d'affichage", () => {
    expect(tmdbImageRole("fr")).toBe("fr");
    expect(tmdbImageRole("ja")).toBe("jp");
    expect(tmdbImageRole("en")).toBe("us");
    expect(tmdbImageRole("de")).toBe("eu");
    expect(tmdbImageRole("es")).toBe("eu");
  });

  it("traite une affiche sans texte (sans langue) comme internationale", () => {
    expect(tmdbImageRole(null)).toBe("wor");
    expect(tmdbImageRole("")).toBe("wor");
    expect(tmdbImageRole(undefined)).toBe("wor");
  });

  it("n'invente pas de région pour une langue inconnue", () => {
    expect(tmdbImageRole("zh")).toBeUndefined();
  });
});

describe("parseTMDBSeriesIntent", () => {
  it("detects a series with explicit season number", () => {
    const result = parseTMDBSeriesIntent(
      "The Last of Us Saison 2",
      (value) => value,
    );

    expect(result.isSeriesLike).toBe(true);
    expect(result.searchTitle).toBe("The Last of Us");
    expect(result.seasonNumber).toBe(2);
  });

  it("keeps movie-like titles as non-series", () => {
    const result = parseTMDBSeriesIntent("Inception", (value) => value);

    expect(result.isSeriesLike).toBe(false);
    expect(result.searchTitle).toBe("Inception");
    expect(result.seasonNumber).toBeUndefined();
  });

  it("falls back to cleanSearchQuery when stripped title is empty", () => {
    const result = parseTMDBSeriesIntent(
      "Season 1 Blu-ray",
      () => "Fallback Title",
    );

    expect(result.searchTitle).toBe("Fallback Title");
    expect(result.isSeriesLike).toBe(true);
    expect(result.seasonNumber).toBe(1);
  });
});
