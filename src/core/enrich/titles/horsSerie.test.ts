import { describe, expect, it } from "vitest";

import {
  hasHorsSerieMarker,
  horsSerieSeriesPart,
  horsSerieSubtitle,
  horsSerieSubtitleIssueNumber,
} from "@/core/enrich/titles/horsSerie";

describe("hasHorsSerieMarker", () => {
  it.each([
    "Super Picsou Géant - Hors-Série - Picsou - Des souvenirs par millions - Tome 1",
    "Picsou Magazine Hors Série n°12",
    "Spirou hors-serie",
  ])("detects the marker in %s", (title) => {
    expect(hasHorsSerieMarker(title)).toBe(true);
  });

  it.each([
    "Super Picsou Géant n°100bis",
    "Naruto Tome 12",
    "Les horsains",
  ])("stays silent on %s", (title) => {
    expect(hasHorsSerieMarker(title)).toBe(false);
  });
});

describe("horsSerieSeriesPart", () => {
  it("returns the series name before the marker", () => {
    expect(
      horsSerieSeriesPart(
        "Super Picsou Géant - Hors-Série - Picsou - Des souvenirs par millions - Tome 1",
      ),
    ).toBe("Super Picsou Géant");
    expect(horsSerieSeriesPart("Picsou Magazine Hors Série n°12")).toBe(
      "Picsou Magazine",
    );
  });

  it("returns null without a marker or when the marker leads", () => {
    expect(horsSerieSeriesPart("Naruto Tome 12")).toBeNull();
    expect(horsSerieSeriesPart("Hors-Série Spécial Été")).toBeNull();
  });
});

describe("horsSerieSubtitle", () => {
  it("returns the part after the marker", () => {
    expect(
      horsSerieSubtitle(
        "Super Picsou Géant - Hors-Série - Tout Picsou de A à Z",
      ),
    ).toBe("Tout Picsou de A à Z");
    expect(
      horsSerieSubtitle(
        "Super Picsou Géant - Hors-Série - Picsou - Des souvenirs par millions - Tome 1",
      ),
    ).toBe("Picsou - Des souvenirs par millions - Tome 1");
  });
});

describe("horsSerieSubtitleIssueNumber", () => {
  it("reads volume markers only from the hors-série subtitle", () => {
    expect(
      horsSerieSubtitleIssueNumber(
        "Super Picsou Géant - Hors-Série - Picsou - Des souvenirs par millions - Tome 1",
      ),
    ).toBe("1");
    expect(
      horsSerieSubtitleIssueNumber(
        "Super Picsou Géant - Hors-Série - Tout Picsou de A à Z",
      ),
    ).toBeNull();
  });
});
