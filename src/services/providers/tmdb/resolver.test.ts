import { describe, expect, it } from "vitest";

import { parseTMDBSeriesIntent } from "./resolver";

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
