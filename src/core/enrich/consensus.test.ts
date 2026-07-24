import { describe, it, expect } from "vitest";
import type { MetadataFact } from "@/types/metadataProvider";
import {
  parseRatingRatio,
  parsePegiAge,
  parsePlaytimeRange,
  computeRatingConsensus,
  computeAgeConsensus,
  computePlaytimeConsensus,
  applyConsensus,
} from "./consensus";

const playtime = (value: string, source: string): MetadataFact => ({
  kind: "playtime",
  label: "Durée d'une partie",
  value,
  source,
});

const rating = (value: string, source: string): MetadataFact => ({
  kind: "rating",
  label: source,
  value,
  source,
});
const pegi = (value: string, source: string): MetadataFact => ({
  kind: "age-rating",
  label: "PEGI",
  value,
  source,
});

describe("parseRatingRatio", () => {
  it.each([
    ["16/20", 0.8],
    ["8.5/10", 0.85],
    ["4/5", 0.8],
    ["82%", 0.82],
  ])("'%s' → %s", (input, expected) => {
    expect(parseRatingRatio(input)).toBeCloseTo(expected, 5);
  });

  it("renvoie null sur valeur non notée ou dénominateur nul", () => {
    expect(parseRatingRatio("excellent")).toBeNull();
    expect(parseRatingRatio("5/0")).toBeNull();
    expect(parseRatingRatio("")).toBeNull();
  });
});

describe("parsePegiAge", () => {
  it.each([
    ["PEGI 12", 12],
    ["12+", 12],
    ["16", 16],
    ["PEGI 18", 18],
  ])("'%s' → %s", (input, expected) => {
    expect(parsePegiAge(input)).toBe(expected);
  });

  it("rejette les âges hors barème PEGI", () => {
    expect(parsePegiAge("PEGI 4")).toBeNull();
    expect(parsePegiAge("tout public")).toBeNull();
  });
});

describe("computeRatingConsensus", () => {
  it("médiane /10 quand ≥2 sources", () => {
    const c = computeRatingConsensus([
      rating("16/20", "ScreenScraper"),
      rating("4/5", "RAWG"),
      rating("9/10", "IGDB"),
    ]);
    expect(c?.value).toBe("8.0/10"); // médiane de 0.8, 0.8, 0.9
    expect(c?.kind).toBe("rating");
    expect(c?.unit).toContain("RAWG");
  });

  it("pas de consensus avec une seule source", () => {
    expect(computeRatingConsensus([rating("8/10", "IGDB")])).toBeNull();
  });
});

describe("computeAgeConsensus — PEGI le plus fréquent", () => {
  it("prend le mode", () => {
    const c = computeAgeConsensus([
      pegi("PEGI 12", "IGDB"),
      pegi("PEGI 12", "TMDB"),
      pegi("PEGI 16", "ScreenScraper"),
    ]);
    expect(c?.value).toBe("PEGI 12");
  });

  it("en cas d'égalité, prend l'âge le plus élevé (prudence)", () => {
    const c = computeAgeConsensus([
      pegi("PEGI 12", "IGDB"),
      pegi("PEGI 16", "TMDB"),
    ]);
    expect(c?.value).toBe("PEGI 16");
  });
});

describe("parsePlaytimeRange", () => {
  it.each([
    ["30 min", [30, 30]],
    ["30mn à 1h", [30, 60]],
    ["1 à 2h", [60, 120]],
    ["30 à 45 min", [30, 45]],
    ["1h30", [90, 90]],
  ])("'%s' → %j", (input, expected) => {
    expect(parsePlaytimeRange(input as string)).toEqual(expected);
  });

  it("renvoie null sur une valeur non exploitable", () => {
    expect(parsePlaytimeRange("variable")).toBeNull();
    expect(parsePlaytimeRange("")).toBeNull();
  });
});

describe("computePlaytimeConsensus — union des intervalles", () => {
  it("fusionne '30mn à 1h' et '30 min' en une seule durée", () => {
    const c = computePlaytimeConsensus([
      playtime("30mn à 1h", "philibert"),
      playtime("30 min", "monsieurde"),
    ]);
    expect(c?.value).toBe("30 min à 1 h");
    expect(c?.kind).toBe("playtime");
    expect(c?.source).toBe("philibert, monsieurde");
  });

  it("pas de consensus avec une seule durée exploitable", () => {
    expect(
      computePlaytimeConsensus([playtime("30 min", "philibert")]),
    ).toBeNull();
  });
});

describe("applyConsensus", () => {
  it("fusionne les durées de partie en un seul fact", () => {
    const out = applyConsensus([
      playtime("30mn à 1h", "philibert"),
      playtime("30 min", "monsieurde"),
    ]);
    const playtimes = out.filter((f) => f.kind === "playtime");
    expect(playtimes).toHaveLength(1);
    expect(playtimes[0].value).toBe("30 min à 1 h");
  });

  it("est idempotent sur la durée de partie", () => {
    const once = applyConsensus([
      playtime("30mn à 1h", "philibert"),
      playtime("30 min", "monsieurde"),
    ]);
    const twice = applyConsensus(once);
    expect(twice.filter((f) => f.kind === "playtime")).toHaveLength(1);
    expect(twice.find((f) => f.kind === "playtime")?.value).toBe(
      "30 min à 1 h",
    );
  });

  it("ajoute la note de consensus en tête et collapse les PEGI", () => {
    const facts = [
      rating("16/20", "ScreenScraper"),
      rating("4/5", "RAWG"),
      pegi("PEGI 12", "IGDB"),
      pegi("PEGI 16", "TMDB"),
    ];
    const out = applyConsensus(facts);
    expect(out[0].label).toBe("Note"); // consensus en tête
    const pegiFacts = out.filter((f) => f.kind === "age-rating");
    expect(pegiFacts).toHaveLength(1);
    expect(pegiFacts[0].value).toBe("PEGI 16");
  });

  it("est idempotent (pas de double note de consensus)", () => {
    const facts = [rating("16/20", "A"), rating("4/5", "B")];
    const once = applyConsensus(facts);
    const twice = applyConsensus(once);
    const notesOnce = once.filter((f) => f.label === "Note").length;
    const notesTwice = twice.filter((f) => f.label === "Note").length;
    expect(notesOnce).toBe(1);
    expect(notesTwice).toBe(1);
  });
});
