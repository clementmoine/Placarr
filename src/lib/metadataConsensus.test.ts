import { describe, it, expect } from "vitest";
import type { MetadataFact } from "@/services/metadata";
import {
  parseRatingRatio,
  parsePegiAge,
  computeRatingConsensus,
  computeAgeConsensus,
  applyConsensus,
} from "./metadataConsensus";

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

describe("applyConsensus", () => {
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
