import { describe, expect, it } from "vitest";
import {
  coerceCardFormatForType,
  faceRotateDeg,
  getCardFormatsForPicker,
  getDefaultCardFormatAlias,
  normalizeFaceQuarterTurns,
  orientAspectRatio,
} from "@/lib/text/cardFormat";

describe("getDefaultCardFormatAlias", () => {
  it.each([
    ["games", "dvd"],
    ["movies", "dvd"],
    ["musics", "square"],
    ["boardgames", "square"],
    ["books", "book"],
    [null, "dvd"],
    [undefined, "dvd"],
  ] as const)("maps %s → %s", (type, alias) => {
    expect(getDefaultCardFormatAlias(type)).toBe(alias);
  });
});

describe("getCardFormatsForPicker", () => {
  it("always hides the Default alias", () => {
    expect(getCardFormatsForPicker("movies")).not.toContain("dvd");
    expect(getCardFormatsForPicker("books")).not.toContain("book");
    expect(getCardFormatsForPicker("musics")).not.toContain("square");
    expect(getCardFormatsForPicker("games")).not.toContain("dvd");
  });

  it("always includes default", () => {
    expect(getCardFormatsForPicker("games")[0]).toBe("default");
  });
});

describe("coerceCardFormatForType", () => {
  it("collapses the alias into default", () => {
    expect(coerceCardFormatForType("square", "musics")).toBe("default");
    expect(coerceCardFormatForType("dvd", "movies")).toBe("default");
    expect(coerceCardFormatForType("book", "books")).toBe("default");
  });

  it("keeps a non-alias named format", () => {
    expect(coerceCardFormatForType("vhs", "musics")).toBe("vhs");
    expect(coerceCardFormatForType("square", "movies")).toBe("square");
    expect(coerceCardFormatForType("tcg", "games")).toBe("tcg");
  });
});

describe("face orientation", () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 0],
    [-1, 3],
    [null, 0],
    [undefined, 0],
  ] as const)("normalizeFaceQuarterTurns(%s) → %s", (input, expected) => {
    expect(normalizeFaceQuarterTurns(input)).toBe(expected);
  });

  it.each([
    ["5 / 7", 0, "5 / 7"],
    ["5 / 7", 1, "7 / 5"],
    ["5 / 7", 2, "5 / 7"],
    ["5 / 7", 3, "7 / 5"],
    ["1 / 1", 1, "1 / 1"],
    ["16 / 9", 1, "9 / 16"],
  ] as const)("orientAspectRatio(%s, %s) → %s", (aspect, turns, expected) => {
    expect(orientAspectRatio(aspect, turns)).toBe(expected);
  });

  it.each([
    [0, 0],
    [1, 90],
    [2, 180],
    [3, 270],
  ] as const)("faceRotateDeg(%s) → %s", (turns, deg) => {
    expect(faceRotateDeg(turns)).toBe(deg);
  });
});
